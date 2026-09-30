# Gallery artwork

The **Gallery** screen shows one frame per piece of artwork found here. It is
not the battle sprites: gallery art is the hand-made picture a species earns a
frame for, and it only appears once you have actually caught that species.

Drop images in this folder, then run `npm run gallery` (or `npm run data`) to
rebuild `src/data/gallery.json`.

## Naming

    bulbasaur.png          → Bulbasaur's frame, unlocked when you catch one
    bulbasaur-shiny.png    → the shiny frame, unlocked only when you catch a shiny one
    001.png                → the same, by national dex number
    001-shiny.png

- species id (`mr-mime.png`) or the dex number, padded or not (`122.png`, `25.png`)
- `-shiny` marks the shiny frame — the two are unlocked separately
- sub-folders are fine (`fire/charizard.png`)
- extensions: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`

Files that do not match a species are reported by the builder and skipped, so a
work-in-progress sketch can sit here without breaking the manifest.

## Unlocking

- **Catch the species** → its frame opens and the artwork is shown.
- **Catch it shiny** → the shiny frame opens on its own. Catching the plain
  version is not enough, and the shiny frame does not unlock the normal one.

The record is part of your Pokédex, so gallery progress survives rebirth.

This folder ships empty: until art is added the Gallery screen shows its empty
state and tells you where to put the files.
