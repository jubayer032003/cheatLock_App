import React, { useRef, useState, useEffect } from "react";

interface VirtualGridProps<T> {
  items: T[];
  itemHeight: number;
  minColumnWidth?: number;
  height?: number;
  gap?: number;
  padding?: number;
  keyExtractor?: (item: T, index: number) => React.Key;
  renderItem: (item: T, index: number) => React.ReactNode;
}

/**
 * Custom light-weight DOM-Virtualizing Grid.
 * Handles dynamic grid column breakpoints and only renders items within the scrollable viewport.
 */
export function VirtualGrid<T>({
  items,
  itemHeight,
  minColumnWidth = 280,
  height = 640,
  gap = 12,
  padding = 0,
  keyExtractor,
  renderItem,
}: VirtualGridProps<T>) {
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

  const contentWidth = Math.max(0, containerWidth - padding * 2);
  const cols = Math.max(1, Math.floor((contentWidth + gap) / (minColumnWidth + gap)));
  const rowCount = Math.ceil(items.length / cols);
  const totalHeight = padding * 2 + rowCount * itemHeight + Math.max(0, rowCount - 1) * gap;

  // Viewport calculations with buffer rows to prevent flashing on fast scrolls
  const viewportHeight = containerRef.current?.clientHeight || height;
  const rowStride = itemHeight + gap;
  const startRow = Math.max(0, Math.floor(Math.max(0, scrollTop - padding) / rowStride) - 1);
  const endRow = Math.min(rowCount, Math.ceil((Math.max(0, scrollTop - padding) + viewportHeight) / rowStride) + 1);

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
      className="relative w-full overflow-y-auto bg-slate-950 scrollbar-thin"
      style={{ height }}
    >
      <div style={{ height: `${totalHeight}px`, width: "100%", position: "relative" }}>
        {visibleItems.map(({ item, index, row, col }) => {
          const top = padding + row * rowStride;
          const width = `calc((100% - ${padding * 2 + (cols - 1) * gap}px) / ${cols})`;
          const left = `calc(${padding}px + ${col} * ((100% - ${padding * 2 + (cols - 1) * gap}px) / ${cols} + ${gap}px))`;

          return (
            <div
              key={keyExtractor?.(item, index) ?? index}
              style={{
                position: "absolute",
                top: `${top}px`,
                left,
                width,
                height: `${itemHeight}px`,
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
