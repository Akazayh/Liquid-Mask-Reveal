# Liquid Mask Reveal

An interactive WebGL experience that uses GPU-accelerated fluid simulation to reveal a hidden image beneath a base image through organic, liquid-like wave distortions.

## Tech Stack

- **Three.js** — WebGL rendering
- **Custom GLSL shaders** — fluid simulation & image compositing
- **Vite** — build tool
- **TypeScript** — type safety

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser and move your mouse to reveal the hidden image.

## How It Works

1. A base image is displayed full-screen
2. Mouse movement drives a GPU wave simulation
3. The simulation generates a displacement field
4. A reveal shader composites both images, using the displacement to create organic, liquid-like transitions along the reveal edge with spectral glow effects

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
