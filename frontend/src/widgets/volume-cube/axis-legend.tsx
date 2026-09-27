import { X_COLOR, Y_COLOR, Z_COLOR } from "./frame-layers";

/** The legend's side (CSS px). */
const SIZE = 48;
const ARM = 15;

/**
 * Each data axis in deck's world: the cube's Z_UP turns data (x, y, z) to
 * world (x, z, -y), and Viv stores Y rows reversed, so data +y (down the map)
 * is world +z and data +z (up the stack) world +y. The frame's axes agree.
 */
const AXES = [
  { name: "x", dir: [1, 0, 0], color: X_COLOR },
  { name: "y", dir: [0, 0, 1], color: Y_COLOR },
  { name: "z", dir: [0, 1, 0], color: Z_COLOR },
] as const;

/**
 * A world direction in camera space for deck's OrbitView about Y (Viv's
 * VolumeView): `rotateX(rotationX) · rotateY(rotationOrbit) · v`; x right, y up
 * the screen, z toward the viewer.
 */
export function cameraDirection(
  v: readonly number[],
  rotationX: number,
  rotationOrbit: number,
): [number, number, number] {
  const a = (rotationOrbit * Math.PI) / 180;
  const b = (rotationX * Math.PI) / 180;
  const x = v[0]! * Math.cos(a) + v[2]! * Math.sin(a);
  const y = v[1]!;
  const z = -v[0]! * Math.sin(a) + v[2]! * Math.cos(a);
  return [x, y * Math.cos(b) - z * Math.sin(b), y * Math.sin(b) + z * Math.cos(b)];
}

/**
 * A small XYZ orientation gizmo in the view's bottom-left corner: each data
 * axis as projected by the current camera, coloured like the frame's axes, so
 * the orientation reads even with the frame's own axes out of view.
 *
 * `data-axes` holds each axis's on-screen angle (degrees, counter-clockwise
 * from the right; 0 for an axis pointing at the viewer) and `data-lengths` its
 * projected length (0 to 1).
 */
export function AxisLegend({ rotationX, rotationOrbit }: { rotationX: number; rotationOrbit: number }) {
  const arms = AXES.map((axis) => {
    const [x, y, z] = cameraDirection(axis.dir, rotationX, rotationOrbit);
    const length = Math.hypot(x, y);
    const angle = length < 0.01 ? 0 : Math.round((Math.atan2(y, x) * 180) / Math.PI) || 0;
    return { ...axis, x, y, z, length, angle };
  });
  // Farthest first, so the axis nearest the viewer is drawn on top.
  const drawn = [...arms].sort((p, q) => p.z - q.z);
  const c = SIZE / 2;
  return (
    <svg
      role="img"
      aria-label="Axes"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="pointer-events-none absolute bottom-1.5 left-1.5 select-none"
      data-axes={arms.map((a) => a.angle).join(",")}
      data-lengths={arms.map((a) => Math.round(a.length * 100) / 100).join(",")}
    >
      {drawn.map((a) => {
        const rgb = `rgb(${a.color.join(" ")})`;
        const tx = c + a.x * ARM;
        const ty = c - a.y * ARM;
        // Labels sit past the tip; an axis at the viewer is a dot, labelled beside it.
        const end = a.length < 0.15;
        const lx = end ? c + 7 : c + a.x * (ARM + 6);
        const ly = end ? c - 7 : c - a.y * (ARM + 6);
        return (
          <g key={a.name} data-axis={a.name}>
            <line x1={c} y1={c} x2={tx} y2={ty} stroke={rgb} strokeWidth={2} strokeLinecap="round" />
            {end ? <circle cx={c} cy={c} r={2.5} fill={rgb} /> : null}
            <text
              x={lx}
              y={ly}
              fill={rgb}
              fontSize={9}
              fontWeight={600}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {a.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
