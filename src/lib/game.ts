export type Difficulty = "beginner" | "intermediate" | "expert";

export const PRESETS: Record<Difficulty, { label: string; rows: number; cols: number; mines: number }> = {
  beginner: { label: "初级", rows: 9, cols: 9, mines: 10 },
  intermediate: { label: "中级", rows: 16, cols: 16, mines: 40 },
  expert: { label: "专家", rows: 16, cols: 30, mines: 99 },
};

export type Cell = { mine: boolean; count: number; revealed: boolean; flagged: boolean };

export function emptyBoard(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, count: 0, revealed: false, flagged: false })),
  );
}

export function createBoard(rows: number, cols: number, mines: number, safeIndex: number): Cell[][] {
  const board = emptyBoard(rows, cols);
  const safe = new Set<number>([safeIndex]);
  const candidates = Array.from({ length: rows * cols }, (_, index) => index).filter((index) => !safe.has(index));
  for (let index = candidates.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
  }
  for (const index of candidates.slice(0, mines)) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    board[row][col].mine = true;
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (board[row][col].mine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r >= 0 && r < rows && c >= 0 && c < cols && board[r][c].mine) count++;
        }
      }
      board[row][col].count = count;
    }
  }
  return board;
}

export function revealCells(board: Cell[][], startRow: number, startCol: number): Cell[][] {
  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  const stack = [[startRow, startCol]];
  while (stack.length) {
    const [row, col] = stack.pop()!;
    const cell = next[row]?.[col];
    if (!cell || cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (cell.count === 0 && !cell.mine) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr || dc) stack.push([row + dr, col + dc]);
        }
      }
    }
  }
  return next;
}
