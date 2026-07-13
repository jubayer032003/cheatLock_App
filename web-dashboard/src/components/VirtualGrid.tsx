import React, { useRef, useState, useEffect } from "react";

interface VirtualGridProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
}

/**
 * Custom light-weight DOM-Virtualizing Grid.
 * Handles dynamic grid column breakpoints and only renders items within the scrollable viewport.
 */
export function VirtualGrid<T>({ items, itemHeight, renderItem }: VirtualGridProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      setScrollTop(el.scrollTop);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });

    el.addEventListener("scroll", handleScroll);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, []);

  // Responsive column counts based on container width
  const cols = containerWidth < 640 ? 1 : containerWidth < 1200 ? 2 : 3;
  const rowCount = Math.ceil(items.length / cols);
  const totalHeight = rowCount * itemHeight;

  // Viewport calculations with buffer rows to prevent flashing on fast scrolls
  const viewportHeight = containerRef.current?.clientHeight || 600;
  const startRow = Math.max(0, Math.floor(scrollTop / itemHeight) - 1);
  const endRow = Math.min(rowCount, Math.ceil((scrollTop + viewportHeight) / itemHeight) + 1);

  const visibleItems = [];
  for (let row = startRow; row < endRow; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      if (index < items.length) {
        visibleItems.push({ item: items[index], index, row, col });
      }
    }
  }

  return (
    <div 
      ref={containerRef} 
      className="overflow-y-auto relative w-full h-[600px] bg-slate-900 scrollbar-thin"
    >
      <div style={{ height: `${totalHeight}px`, width: "100%", position: "relative" }}>
        {visibleItems.map(({ item, index, row, col }) => {
          const top = row * itemHeight;
          const left = (col / cols) * 100;
          const widthPct = 100 / cols;

          return (
            <div
              key={index}
              style={{
                position: "absolute",
                top: `${top}px`,
                left: `${left}%`,
                width: `${widthPct}%`,
                height: `${itemHeight}px`,
                padding: "8px",
                boxSizing: "border-box"
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
