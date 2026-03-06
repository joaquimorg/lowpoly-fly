# Procedural Flight Simulation

A continuous, low-poly flight simulation built with Three.js and Simplex Noise. Experience a relaxing journey over an infinite landscape of snow-capped mountains, deep valleys, and serene lakes.

## 🚀 Features

- **Infinite Procedural Terrain**: Dynamically generated using multi-octave Simplex Noise and a chunk-recycling system for seamless, endless flight.
- **Intelligent Flight AI**: Advanced look-ahead "radar" system that predicts terrain obstacles and navigates the aircraft through valleys and around peaks.
- **Realistic Flight Physics**: Simulated pitch, roll, and yaw with smooth banking and dampened movements for a "heavy" aircraft feel.
- **Dynamic Environment**:
  - **Snow-capped Peaks**: Automatic vertex coloring based on terrain elevation.
  - **Water Bodies**: Procedural lakes and rivers filling low-lying valleys.
  - **High-altitude Clouds**: Low-poly floating clouds for atmospheric depth.
- **Advanced Lighting**:
  - **Sun Implementation**: A distant, static sun mesh that provides accurate directional light.
  - **Soft Shadows**: Optimized PCFSoftShadowMap with "texel snapping" to prevent shadow shimmering/crawling.
- **Navigation HUD**:
  - **Real-time Minimap**: A top-down radar view showing upcoming terrain and aircraft heading.
  - **Crosshair & HUD**: Minimalist flight interface for better immersion.

## 🛠️ Technologies Used

- **[Three.js](https://threejs.org/)**: 3D Engine for rendering the world, lighting, and physics.
- **[Simplex-noise](https://www.npmjs.com/package/simplex-noise)**: For generating smooth, natural terrain heightmaps.
- **Vite**: Modern build tool and development server.
- **Vanilla JavaScript, HTML5, & CSS3**.

## 💻 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (latest LTS recommended)

### Installation

1. Clone or download the project files.
2. Open a terminal in the project directory.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open your browser to the URL shown in the terminal (usually `http://localhost:5173`).

## 🎮 How it Works

The simulation uses a **chunk-based recycling system**. When a terrain segment moves behind the camera, it is teleported ahead of the plane and its geometry is regenerated with new noise data. The flight AI scans multiple points ahead of the aircraft, averaging heights to find the safest path, allowing the plane to "weave" through the landscape naturally.

---
&copy; 2026 joaquim.org
