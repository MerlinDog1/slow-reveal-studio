/** Licensed lab references, not customer results or validated physical products.
 * Full provenance and licence restrictions: public/references/README.md.
 */
export const REFERENCE_IMAGES = [
  {
    id: "portrait",
    label: "Portrait",
    src: "/references/portrait.jpg",
    alt: "Studio self-portrait of a man wearing a dark hat",
    credit: "Joe Gardner / Unsplash",
    source: "https://unsplash.com/photos/man-wearing-black-hat-6p8ngTH1bUI",
  },
  {
    id: "couple",
    label: "Couple",
    src: "/references/couple.jpg",
    alt: "A couple kissing on a beach",
    credit: "Marionel Luciano / Unsplash",
    source:
      "https://unsplash.com/photos/couple-kissing-on-beach-during-daytime-Liz-yK48FuA",
  },
  {
    id: "family",
    label: "Family",
    src: "/references/family.jpg",
    alt: "Two adults and a child sitting together on a sofa",
    credit: "Vitaly Gariev / Unsplash",
    source:
      "https://unsplash.com/photos/a-happy-family-of-three-posing-for-a-photo-SwaEMQAzP_8",
  },
  {
    id: "black-dog",
    label: "Black dog",
    src: "/references/black-dog.jpg",
    alt: "Close-up of a black Labrador against a plain backdrop",
    credit: "Mac Gaither / Unsplash",
    source: "https://unsplash.com/photos/black-labrador-retriever-ITGs9TnB9og",
  },
  {
    id: "light-pet",
    label: "Light pet",
    src: "/references/light-pet.jpg",
    alt: "A light-coated golden retriever outdoors",
    credit: "Linoleum Creative Collective / Unsplash",
    source: "https://unsplash.com/photos/adult-golden-retriever-hhD4BT2OIIY",
  },
  {
    id: "building",
    label: "Building",
    src: "/references/building.jpg",
    alt: "A thatched cottage and garden in Merthyr Mawr, Wales",
    credit: "T (@tanyabarrow) / Unsplash",
    source:
      "https://unsplash.com/photos/thatched-roof-cottage-surrounded-by-trees-and-garden-ApgKMT5RpzY",
  },
  {
    id: "vehicle",
    label: "Vehicle",
    src: "/references/vehicle.jpg",
    alt: "A vintage white car parked by a garage",
    credit: "Nathan Dumlao / Unsplash",
    source: "https://unsplash.com/photos/vintage-white-car-Eh8PK-jlLCI/",
  },
  {
    id: "landscape",
    label: "Landscape",
    src: "/references/landscape.jpg",
    alt: "Mountain scenery and water in Patagonia at dawn",
    credit: "Eric Carlson / Unsplash",
    source:
      "https://unsplash.com/photos/landscape-photo-of-lake-near-mountain-alps-N4C2DMEpWxo",
  },
] as const;

export type ReferenceImage = (typeof REFERENCE_IMAGES)[number];
