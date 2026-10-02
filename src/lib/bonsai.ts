export type ColorClass = "trunk" | "branch" | "dying" | "dead";

export interface Step {
  x: number;
  y: number;
  char: string;
  color: ColorClass;
}

export interface BonsaiConfig {
  lifeStart: number;
  multiplier: number;
  leaves: string[];
  baseType: number;
  rows: number;
  cols: number;
}

export interface BonsaiResult {
  treeSteps: Step[];
  potLines: string[];
  rows: number;
  cols: number;
}

const POTS: Record<number, string[]> = {
  1: [
    ":___________./~~~\\.___________:",
    " \\                           / ",
    "  \\_________________________/ ",
    "  (_)                     (_)",
  ],
  2: ["(---./~~~\\.---)", " (           ) ", "  (_________)  "],
};

type BranchType = "trunk" | "shootLeft" | "shootRight" | "dying" | "dead";

function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function setDeltas(
  type: BranchType,
  life: number,
  age: number,
  multiplier: number,
): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;

  switch (type) {
    case "trunk":
      if (age <= 2 || life < 4) {
        dy = 0;
        dx = randInt(3) - 1;
      } else if (age < multiplier * 3) {
        dy = age % Math.floor(multiplier * 0.5) === 0 ? -1 : 0;
        const dice = randInt(10);
        if (dice === 0) dx = -2;
        else if (dice <= 3) dx = -1;
        else if (dice <= 5) dx = 0;
        else if (dice <= 8) dx = 1;
        else dx = 2;
      } else {
        dy = randInt(10) > 2 ? -1 : 0;
        dx = randInt(3) - 1;
      }
      break;
    case "shootLeft": {
      const ddy = randInt(10);
      dy = ddy <= 1 ? -1 : ddy <= 7 ? 0 : 1;
      const ddx = randInt(10);
      dx = ddx <= 1 ? -2 : ddx <= 5 ? -1 : ddx <= 8 ? 0 : 1;
      break;
    }
    case "shootRight": {
      const ddy2 = randInt(10);
      dy = ddy2 <= 1 ? -1 : ddy2 <= 7 ? 0 : 1;
      const ddx2 = randInt(10);
      dx = ddx2 <= 1 ? 2 : ddx2 <= 5 ? 1 : ddx2 <= 8 ? 0 : -1;
      break;
    }
    case "dying": {
      const ddy3 = randInt(10);
      dy = ddy3 <= 1 ? -1 : ddy3 <= 8 ? 0 : 1;
      const ddx3 = randInt(15);
      dx =
        ddx3 === 0
          ? -3
          : ddx3 <= 2
            ? -2
            : ddx3 <= 5
              ? -1
              : ddx3 <= 8
                ? 0
                : ddx3 <= 11
                  ? 1
                  : ddx3 <= 13
                    ? 2
                    : 3;
      break;
    }
    case "dead": {
      const ddy4 = randInt(10);
      dy = ddy4 <= 2 ? -1 : ddy4 <= 6 ? 0 : 1;
      dx = randInt(3) - 1;
      break;
    }
  }

  return { dx, dy };
}

function chooseStr(
  type: BranchType,
  life: number,
  dx: number,
  dy: number,
  leaves: string[],
): { char: string; color: ColorClass } {
  const effectiveType = life < 4 ? "dying" : type;

  switch (effectiveType) {
    case "trunk":
      if (dy === 0) return { char: "/~", color: "trunk" };
      if (dx < 0) return { char: "\\|", color: "trunk" };
      if (dx === 0) return { char: "/|\\", color: "trunk" };
      return { char: "|/", color: "trunk" };
    case "shootLeft":
      if (dy > 0) return { char: "\\", color: "branch" };
      if (dy === 0) return { char: "\\_", color: "branch" };
      if (dx < 0) return { char: "\\|", color: "branch" };
      if (dx === 0) return { char: "/|", color: "branch" };
      return { char: "/", color: "branch" };
    case "shootRight":
      if (dy > 0) return { char: "/", color: "branch" };
      if (dy === 0) return { char: "_/", color: "branch" };
      if (dx < 0) return { char: "\\|", color: "branch" };
      if (dx === 0) return { char: "/|", color: "branch" };
      return { char: "/", color: "branch" };
    case "dying":
      return { char: leaves[randInt(leaves.length)], color: "dying" };
    case "dead":
      return { char: leaves[randInt(leaves.length)], color: "dead" };
  }
}

interface SharedState {
  shootCounter: number;
}

function branchFn(
  steps: Step[],
  y: number,
  x: number,
  type: BranchType,
  life: number,
  lifeStart: number,
  multiplier: number,
  leaves: string[],
  state: SharedState,
  rowLimit: number,
  cols: number,
): void {
  let shootCooldown = multiplier;
  let yy = y;
  let xx = x;

  while (life > 0) {
    life--;
    const age = lifeStart - life;

    const { dx, dy } = setDeltas(type, life, age, multiplier);

    if (life < 3) {
      branchFn(steps, yy, xx, "dead", life, lifeStart, multiplier, leaves, state, rowLimit, cols);
    } else if (type === "trunk" && life < multiplier + 2) {
      branchFn(steps, yy, xx, "dying", life, lifeStart, multiplier, leaves, state, rowLimit, cols);
    } else if (
      (type === "shootLeft" || type === "shootRight") &&
      life < multiplier + 2
    ) {
      branchFn(steps, yy, xx, "dying", life, lifeStart, multiplier, leaves, state, rowLimit, cols);
    } else if (type === "trunk" && (randInt(3) === 0 || life % multiplier === 0)) {
      if (randInt(8) === 0 && life > 7) {
        shootCooldown = multiplier * 2;
        branchFn(steps, yy, xx, "trunk", life + randInt(5) - 2, lifeStart, multiplier, leaves, state, rowLimit, cols);
      } else if (shootCooldown <= 0) {
        shootCooldown = multiplier * 2;
        state.shootCounter++;
        const shootType = state.shootCounter % 2 === 0 ? "shootLeft" : "shootRight";
        branchFn(steps, yy, xx, shootType, life + multiplier, lifeStart, multiplier, leaves, state, rowLimit, cols);
      }
    }
    shootCooldown--;

    let actualDy = dy;
    if (dy > 0 && yy > rowLimit - 2) actualDy = 0;
    yy += actualDy;
    xx += dx;

    const { char, color } = chooseStr(type, life, dx, actualDy, leaves);

    if (yy >= 0 && yy < rowLimit && xx >= 0 && xx < cols) {
      steps.push({ x: xx, y: yy, char, color });
    }
  }
}

const DEFAULT_CONFIG: BonsaiConfig = {
  lifeStart: 64,
  multiplier: 5,
  leaves: ["&", "@", "%", "*", "+", "#", "o", "O", "^", "~"],
  baseType: 0,
  rows: 28,
  cols: 40,
};

export function generateBonsai(cfg?: Partial<BonsaiConfig>): BonsaiResult {
  const config = { ...DEFAULT_CONFIG, ...cfg };
  const baseType = config.baseType || (Math.random() > 0.5 ? 1 : 2);

  const steps: Step[] = [];
  const potLines = POTS[baseType] || POTS[1];

  const startY = config.rows - potLines.length - 1;
  const startX = Math.floor(config.cols / 2);

  branchFn(
    steps,
    startY,
    startX,
    "trunk",
    config.lifeStart,
    config.lifeStart,
    config.multiplier,
    config.leaves,
    { shootCounter: randInt(100) },
    config.rows - potLines.length,
    config.cols,
  );

  return {
    treeSteps: steps,
    potLines,
    rows: config.rows,
    cols: config.cols,
  };
}
