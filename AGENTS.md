# Project Guidelines

- This is a Vite project using Vanilla JavaScript.
- Keep HTML, CSS, and JavaScript in separate files.
- Keep `index.html` in the project root.
- Keep application CSS and JavaScript files in `src/`.
- Keep configuration files such as `vite.config.js` in the project root.
- Load JavaScript with ES modules.
- Import application CSS from the JavaScript entry file so Vite includes it in the build.
- Install external JavaScript libraries with `npm install` and import them from the application code. Do not use CDN scripts.
- Inspect existing files and configuration before making changes, and modify only what is necessary.
- Use the root `index.html` as the Vite entry point and `dist/` as the build output directory.
- Before handing off code changes, run `npm run build` and confirm that the build succeeds.
- For Netlify, use `npm run build` as the build command and `dist` as the publish directory.
