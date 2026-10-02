import { useEffect, useRef, useState } from "react";
import { generateBonsai, type ColorClass, type Step } from "../lib/bonsai";
import "./bonsai.css";

const STEP_INTERVAL_MS = 24;

const LEAF_COLORS: Record<string, string> = {
  "&": "#2f6b4f",
  "@": "#3f8a63",
  "%": "#5aa478",
  "*": "#7fc49a",
  "+": "#bfe3d2",
  "#": "#4f9d78",
  o: "#e88ca0",
  O: "#f3a8bb",
  "^": "#d4452a",
  "~": "#e3a51a",
};

const COLOR_MAP: Record<ColorClass, string> = {
  trunk: "#5b4636",
  branch: "#7a5c42",
  dying: "#e3a51a",
  dead: "#5aa478",
};

function buildGrid(
  steps: Step[],
  count: number,
  potLines: string[],
  rows: number,
  cols: number,
): { chars: string[][]; colors: string[][] } {
  const chars: string[][] = Array.from({ length: rows }, () => Array(cols).fill(" "));
  const colors: string[][] = Array.from({ length: rows }, () => Array(cols).fill(""));

  const potStart = rows - potLines.length;
  for (let i = 0; i < potLines.length; i++) {
    const line = potLines[i];
    const pad = Math.floor((cols - line.length) / 2);
    for (let j = 0; j < line.length; j++) {
      const cx = pad + j;
      if (cx >= 0 && cx < cols) {
        chars[potStart + i][cx] = line[j];
        colors[potStart + i][cx] = line[j] !== " " ? "#b0a28c" : "";
      }
    }
  }

  for (let i = 0; i < Math.min(count, steps.length); i++) {
    const s = steps[i];
    for (let j = 0; j < s.char.length; j++) {
      const cx = s.x + j;
      if (cx >= 0 && cx < cols && s.y >= 0 && s.y < rows) {
        chars[s.y][cx] = s.char[j];
        if (s.color === "dying" || s.color === "dead") {
          colors[s.y][cx] = LEAF_COLORS[s.char[j]] || COLOR_MAP[s.color];
        } else {
          colors[s.y][cx] = COLOR_MAP[s.color];
        }
      }
    }
  }

  return { chars, colors };
}

export default function Bonsai() {
  const [result, setResult] = useState<ReturnType<typeof generateBonsai> | null>(null);
  const [revealed, setRevealed] = useState(0);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const res = generateBonsai({ lifeStart: 36, multiplier: 5, rows: 20, cols: 34 });
    setResult(res);
    setRevealed(0);

    animRef.current = setInterval(() => {
      setRevealed((r) => {
        if (r >= res.treeSteps.length) {
          if (animRef.current) clearInterval(animRef.current);
          return r;
        }
        return r + 1;
      });
    }, STEP_INTERVAL_MS);

    return () => {
      if (animRef.current) clearInterval(animRef.current);
    };
  }, []);

  if (!result) return null;

  const { chars, colors } = buildGrid(
    result.treeSteps,
    revealed,
    result.potLines,
    result.rows,
    result.cols,
  );

  return (
    <div className="bonsai-container">
      <pre className="bonsai-pre">
        {chars.map((row, yi) => (
          <div key={yi} className="bonsai-row">
            {row.map((char, xi) => (
              <span
                key={xi}
                className="bonsai-char"
                style={colors[yi][xi] ? { color: colors[yi][xi] } : undefined}
              >
                {char === " " ? " " : char}
              </span>
            ))}
          </div>
        ))}
      </pre>
    </div>
  );
}
