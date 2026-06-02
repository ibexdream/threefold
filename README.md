# Threefold

Interactive Threefold hero experience built with React, Vite, and Tailwind CSS.

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy to GitHub Pages

This repository includes a GitHub Actions workflow in `.github/workflows/pages.yml`.

1. Push the project to a public GitHub repository.
2. In GitHub, open the repository settings.
3. Go to `Pages`.
4. Set `Build and deployment` -> `Source` to `GitHub Actions`.
5. Push to the `main` branch.

GitHub Actions will build the Vite app and publish the `dist` folder to GitHub Pages.
