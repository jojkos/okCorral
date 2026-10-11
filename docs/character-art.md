# Character artwork

The sprite pair in `public/characters/gunslingers.webp` was generated with the built-in image generation tool from the existing game artwork, then revised after user review. It keeps the flat cartoon western direction, teal sheriff and rust outlaw. The sheriff has a broader face, tidy coat and full moustache; the outlaw has a leaner face, loose hair, goatee, neckerchief and worn coat hem.

The asset has a transparent alpha channel. The original generation preview shows RGB background colours which are transparent in the saved asset. WebP encoding retains that alpha channel. No external art library is required.

`src/lib/cowboySprites.ts` defines joints and source-space regions for the two illustrations. It animates legs, the gun arm and the detached hat from existing presentation poses. The shared canvas renderer uses these assets in the menu, host, arena and phone portraits. Gameplay rules, decisions and timing are unchanged; muzzle coordinates follow the illustrated revolver.

Final generation prompt (background extraction edit, using the approved distinct-character concept as reference):

> Background extraction edit ONLY. Keep these EXACT two cartoon characters unchanged in every detail, same facial features, clothing, colours, pose, silhouettes, outline, side by side layout, and full body scale. Remove ALL background, including black backing, coloured orange/teal glows, light halos, atmospheric gradients and exterior shadows around both figures. Make everything outside the actual character silhouettes fully transparent alpha=0. Preserve opaque flat colours inside the two characters. Clean tight antialiased edges with no halo or glow. This is a production game sprite cutout, not concept illustration. No new shadows or lighting, no visual redesign. Keep exactly the full sheriff on left and distinct lean outlaw on right, both facing right with revolvers extended, entire hats and boots visible.
