import { useEffect } from "react";

interface Props {
  images: string[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export default function ImageLightbox({ images, index, onClose, onIndexChange }: Props) {
  const count = images.length;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onIndexChange((index + 1) % count);
      else if (e.key === "ArrowLeft") onIndexChange((index - 1 + count) % count);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, count, onClose, onIndexChange]);

  if (count === 0) return null;

  return (
    <div className="lightbox-overlay" onMouseDown={onClose}>
      <div className="lightbox-content" onMouseDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="lightbox-close"
          onClick={onClose}
          title="Cerrar"
        >
          ×
        </button>
        <div className="lightbox-stage">
          {count > 1 && (
            <button
              type="button"
              className="lightbox-nav lightbox-prev"
              onClick={() => onIndexChange((index - 1 + count) % count)}
              title="Anterior"
            >
              ‹
            </button>
          )}
          <img
            className="lightbox-image"
            src={images[index]}
            alt={`Imagen ${index + 1} de ${count}`}
          />
          {count > 1 && (
            <button
              type="button"
              className="lightbox-nav lightbox-next"
              onClick={() => onIndexChange((index + 1) % count)}
              title="Siguiente"
            >
              ›
            </button>
          )}
        </div>
        {count > 1 && (
          <div className="lightbox-counter">
            {index + 1} / {count}
          </div>
        )}
      </div>
    </div>
  );
}
