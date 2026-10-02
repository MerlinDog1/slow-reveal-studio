"use client";
import { useEffect, useRef, useState } from "react";

/** Coalesce slider gestures; history is scoped to the current photo and never touches paid snapshots. */
export function useStudioHistory<T>(
  value: T,
  restore: (snapshot: T) => void,
  scope: string,
) {
  const [position, setPosition] = useState({ index: 0, count: 1 });
  const history = useRef<T[]>([value]),
    index = useRef(0),
    replay = useRef(false),
    previousScope = useRef(scope);
  useEffect(() => {
    if (scope !== previousScope.current) {
      history.current = [value];
      index.current = 0;
      previousScope.current = scope;
      setPosition({ index: 0, count: 1 });
      return;
    }
    if (replay.current) {
      replay.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if (
        JSON.stringify(history.current[index.current]) === JSON.stringify(value)
      )
        return;
      history.current = [
        ...history.current.slice(0, index.current + 1),
        value,
      ].slice(-35);
      index.current = history.current.length - 1;
      setPosition({ index: index.current, count: history.current.length });
    }, 250);
    return () => clearTimeout(timer);
  }, [value, scope]);
  const move = (direction: number) => {
    const next = index.current + direction;
    if (next < 0 || next >= history.current.length) return;
    replay.current = true;
    index.current = next;
    restore(history.current[next]);
    setPosition({ index: next, count: history.current.length });
  };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        (event.target instanceof Element &&
          event.target.closest(
            "input, textarea, select, [contenteditable=true]",
          ))
      )
        return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        move(event.shiftKey ? 1 : -1);
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        move(1);
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  });
  return {
    undo: () => move(-1),
    redo: () => move(1),
    canUndo: position.index > 0,
    canRedo: position.index < position.count - 1,
  };
}
