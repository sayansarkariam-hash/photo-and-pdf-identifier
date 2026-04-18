# photo-and-pdf-identifier
[README.md](https://github.com/user-attachments/files/26850433/README.md)
# Photo and PDF Identifier

A modern, high-performance desktop application built with Electron to identify and manage duplicate photos and PDF documents.

## Features

- **Photo Identification**: Uses perceptual hashing (dHash) to find visually similar images, even if they have different resolutions or minor compression differences.
- **PDF Identification**: Uses MD5 content hashing to identify exact duplicate PDF documents.
- **Premium UI**: Sleek, dark-mode interface with glassmorphism effects and smooth transitions.
- **Smart Cleanup**: Automatically identifies the "best" version to keep (highest resolution for photos) and helps you move duplicates to the Recycle Bin safely.

## Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/)
- **Image Processing**: [Sharp](https://sharp.pixelplumbing.com/)
- **UI/UX**: HTML5, Vanilla CSS3 (Custom Design System), Javascript

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App

```bash
npm start
```

### Building for Production

```bash
npm run dist
```

## License

This project is licensed under the ISC License.
