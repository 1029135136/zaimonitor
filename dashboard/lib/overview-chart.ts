export function buildLinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) {
    return "M0,0";
  }
  if (values.length === 1) {
    return `M0,${height / 2} L${width},${height / 2}`;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
