"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent } from "react";
import { createBoard, emptyBoard, PRESETS, revealCells, type Cell, type Difficulty } from "@/lib/game";

type Player = { id: string; username: string };
type Score = { id: string; user_id: string; elapsed_seconds: number; created_at: string; profiles: { username: string } | { username: string }[] | null };
type Group = { id: string; name: string; invite_code: string; owner_id: string | null };
type GameState = "ready" | "playing" | "won" | "lost";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "请求失败，请稍后重试。");
  return result as T;
}

function displayName(score: Score) {
  return Array.isArray(score.profiles) ? score.profiles[0]?.username ?? "玩家" : score.profiles?.username ?? "玩家";
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export default function MinesweeperApp() {
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [rowsInput, setRowsInput] = useState("9");
  const [colsInput, setColsInput] = useState("9");
  const [minesInput, setMinesInput] = useState("10");
  const [custom, setCustom] = useState(false);
  const [board, setBoard] = useState<Cell[][]>(() => emptyBoard(9, 9));
  const [gameState, setGameState] = useState<GameState>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [globalScores, setGlobalScores] = useState<Score[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState("");
  const [groupScores, setGroupScores] = useState<Score[]>([]);
  const [groupName, setGroupName] = useState("");
  const [invite, setInvite] = useState("");
  const [groupMessage, setGroupMessage] = useState("");
  const [notice, setNotice] = useState("");
  const gameToken = useRef(0);
  const submittedToken = useRef(-1);

  const rows = Number(rowsInput);
  const cols = Number(colsInput);
  const mines = Number(minesInput);
  const configValid = Number.isInteger(rows) && Number.isInteger(cols) && Number.isInteger(mines)
    && rows >= 5 && rows <= 30 && cols >= 5 && cols <= 40 && mines >= 1 && mines < rows * cols;
  const totalFlags = useMemo(() => board.flat().filter((cell) => cell.flagged).length, [board]);
  const safeCells = rows * cols - mines;

  const loadScores = useCallback(async (which = difficulty) => {
    try {
      const result = await api<{ scores: Score[] }>(`/api/scores?difficulty=${which}`);
      setGlobalScores(result.scores);
    } catch {
      setGlobalScores([]);
    }
  }, [difficulty]);

  const loadGroups = useCallback(async () => {
    try {
      const result = await api<{ groups: Group[] }>("/api/groups");
      setGroups(result.groups);
      setActiveGroup((current) => current && result.groups.some((group) => group.id === current) ? current : result.groups[0]?.id ?? "");
    } catch {
      setGroups([]);
      setActiveGroup("");
    }
  }, []);

  useEffect(() => {
    api<{ user: Player | null }>("/api/me").then(({ user }) => setPlayer(user)).catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadScores();
  }, [loadScores]);

  useEffect(() => {
    if (player) void loadGroups();
    else { setGroups([]); setActiveGroup(""); setGroupScores([]); }
  }, [player, loadGroups]);

  useEffect(() => {
    if (!player || !activeGroup) { setGroupScores([]); return; }
    api<{ scores: Score[] }>(`/api/groups/${activeGroup}/scores?difficulty=${difficulty}`)
      .then(({ scores }) => setGroupScores(scores)).catch(() => setGroupScores([]));
  }, [player, activeGroup, difficulty]);

  useEffect(() => {
    if (gameState !== "playing" || startedAt === null) return;
    const update = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [gameState, startedAt]);

  useEffect(() => {
    if (gameState !== "won" || custom || !player || submittedToken.current === gameToken.current) return;
    submittedToken.current = gameToken.current;
    api("/api/scores", { method: "POST", body: JSON.stringify({ difficulty, elapsed_seconds: Math.max(1, elapsed) }) })
      .then(() => { setNotice("成绩已记录！"); void loadScores(difficulty); if (activeGroup) void api(`/api/groups/${activeGroup}/scores?difficulty=${difficulty}`).then((data: any) => setGroupScores(data.scores)); })
      .catch((error: Error) => setNotice(error.message));
  }, [gameState, custom, player, difficulty, elapsed, loadScores, activeGroup]);

  const newGame = useCallback((nextRows = rows, nextCols = cols, nextMines = mines) => {
    if (!Number.isInteger(nextRows) || !Number.isInteger(nextCols) || !Number.isInteger(nextMines)
      || nextRows < 5 || nextRows > 30 || nextCols < 5 || nextCols > 40 || nextMines < 1 || nextMines >= nextRows * nextCols) {
      setNotice("棋盘需为 5–30 行、5–40 列，雷数必须小于格子总数。");
      return;
    }
    gameToken.current++;
    setBoard(emptyBoard(nextRows, nextCols));
    setGameState("ready");
    setStartedAt(null);
    setElapsed(0);
    setNotice("");
  }, [rows, cols, mines]);

  const reveal = (row: number, col: number) => {
    if (gameState === "won" || gameState === "lost" || board[row]?.[col]?.revealed || board[row]?.[col]?.flagged) return;
    const next = gameState === "ready"
      ? createBoard(rows, cols, mines, row * cols + col).map((line, r) => line.map((cell, c) => ({ ...cell, flagged: board[r]?.[c]?.flagged ?? false })))
      : board;
    if (gameState === "ready") {
      setBoard(next);
      setGameState("playing");
      setStartedAt(Date.now());
      setNotice("");
    }
    const revealed = revealCells(next, row, col);
    if (revealed[row][col].mine) {
      setBoard(revealed.map((line) => line.map((cell) => cell.mine ? { ...cell, revealed: true } : cell)));
      setGameState("lost");
      setNotice("踩到地雷了，再试一次！");
      return;
    }
    setBoard(revealed);
    const opened = revealed.flat().filter((cell) => cell.revealed).length;
    if (opened >= safeCells) {
      if (startedAt !== null) setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      setGameState("won");
      setNotice(custom ? "漂亮！自定义棋盘完成。" : player ? "漂亮！正在提交成绩…" : "漂亮！登录后即可把成绩加入排行榜。");
    }
  };

  const toggleFlag = (event: MouseEvent, row: number, col: number) => {
    event.preventDefault();
    if (gameState === "won" || gameState === "lost" || board[row]?.[col]?.revealed) return;
    setBoard((current) => current.map((line, r) => line.map((cell, c) => r === row && c === col ? { ...cell, flagged: !cell.flagged } : cell)));
  };

  const chooseDifficulty = (value: Difficulty) => {
    setDifficulty(value);
    const preset = PRESETS[value];
    setRowsInput(String(preset.rows)); setColsInput(String(preset.cols)); setMinesInput(String(preset.mines)); setCustom(false);
    newGame(preset.rows, preset.cols, preset.mines);
  };

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault(); setAuthError(""); setAuthBusy(true);
    try {
      if (authMode === "register") await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) });
      const result = await api<{ username: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      const me = await api<{ user: Player }>("/api/me");
      setPlayer(me.user ?? { id: "", username: result.username });
      setPassword(""); setNotice("欢迎回来，" + result.username); void loadGroups();
    } catch (error) { setAuthError(error instanceof Error ? error.message : "登录失败，请重试。"); }
    finally { setAuthBusy(false); }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setPlayer(null); setNotice("已退出登录。");
  };

  const createGroup = async (event: FormEvent) => {
    event.preventDefault(); setGroupMessage("");
    try {
      const result = await api<{ group: Group }>("/api/groups", { method: "POST", body: JSON.stringify({ name: groupName }) });
      setGroupName(""); setGroupMessage(`群组已创建，邀请码：${result.group.invite_code}`); await loadGroups(); setActiveGroup(result.group.id);
    } catch (error) { setGroupMessage(error instanceof Error ? error.message : "创建失败。"); }
  };

  const joinGroup = async (event: FormEvent) => {
    event.preventDefault(); setGroupMessage("");
    try {
      await api("/api/groups/join", { method: "POST", body: JSON.stringify({ invite_code: invite }) });
      setInvite(""); setGroupMessage("加入成功！"); await loadGroups();
    } catch (error) { setGroupMessage(error instanceof Error ? error.message : "加入失败。"); }
  };

  const activeGroupData = groups.find((group) => group.id === activeGroup);
  const revealedCount = board.flat().filter((cell) => cell.revealed && !cell.mine).length;
  const displayRows = board.length || rows;
  const displayCols = board[0]?.length || cols;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a href="#top" className="brand"><span className="brand-icon">✳</span><span>扫雷<span className="brand-light">俱乐部</span></span></a>
        <div className="top-actions">
          {player ? <><span className="online-dot" /> <span className="top-user">{player.username}</span><button className="text-button" onClick={logout}>退出</button></> : <a className="top-login" href="#account">登录 / 注册 <span>↗</span></a>}
        </div>
      </header>

      <div className="layout-grid" id="top">
        <section className="main-column">
          <div className="eyebrow"><span className="eyebrow-line" /> MINESWEEPER CLUB <span className="eyebrow-line" /></div>
          <h1>安静思考，<em>精准出击。</em></h1>
          <p className="subtitle">经典扫雷，和朋友一起刷新纪录。</p>

          <div className="game-card">
            <div className="game-toolbar">
              <div className="difficulty-tabs" role="tablist" aria-label="游戏难度">
                {(Object.keys(PRESETS) as Difficulty[]).map((key) => <button key={key} role="tab" aria-selected={!custom && difficulty === key} className={!custom && difficulty === key ? "difficulty active" : "difficulty"} onClick={() => chooseDifficulty(key)}>{PRESETS[key].label}</button>)}
                <button role="tab" aria-selected={custom} className={custom ? "difficulty active" : "difficulty"} onClick={() => { setCustom(true); }}>自定义</button>
              </div>
              <button className="restart-button" title="重新开始" onClick={() => newGame()}>↻ <span>新游戏</span></button>
            </div>

            <div className="game-stats">
              <div className="stat-box"><span className="stat-icon mine-icon">✹</span><div><small>剩余地雷</small><strong>{String(Math.max(0, mines - totalFlags)).padStart(3, "0")}</strong></div></div>
              <div className="face-button" aria-label="游戏状态">{gameState === "won" ? "😎" : gameState === "lost" ? "😵" : gameState === "playing" ? "🤔" : "🙂"}</div>
              <div className="stat-box stat-right"><span className="stat-icon clock-icon">◷</span><div><small>用时</small><strong>{formatTime(elapsed)}</strong></div></div>
            </div>

            {custom && <div className="custom-controls">
              <label>行数<input inputMode="numeric" value={rowsInput} onChange={(e) => setRowsInput(e.target.value)} /></label>
              <label>列数<input inputMode="numeric" value={colsInput} onChange={(e) => setColsInput(e.target.value)} /></label>
              <label>地雷<input inputMode="numeric" value={minesInput} onChange={(e) => setMinesInput(e.target.value)} /></label>
              <button disabled={!configValid} onClick={() => newGame()} className="apply-button">应用</button>
              {!configValid && <span className="input-hint">行 5–30、列 5–40，雷数小于格子数</span>}
            </div>}

            <div className="board-scroll"><div className={`mine-board ${displayCols > 18 ? "wide-board" : ""}`} style={{ "--columns": displayCols } as CSSProperties} onContextMenu={(event) => event.preventDefault()}>
              {Array.from({ length: displayRows }, (_, row) => Array.from({ length: displayCols }, (_, col) => {
                const cell = board[row]?.[col] ?? { mine: false, count: 0, revealed: false, flagged: false };
                let content = cell.flagged ? "⚑" : cell.revealed ? cell.mine ? "✹" : cell.count || "" : "";
                let className = `cell ${cell.revealed ? "revealed" : "covered"}`;
                if (cell.revealed && cell.mine) className += " cell-mine";
                if (typeof content === "number") className += ` number-${content}`;
                return <button key={`${row}-${col}`} className={className} aria-label={`第 ${row + 1} 行第 ${col + 1} 列${cell.flagged ? "，已插旗" : cell.revealed ? cell.mine ? "，地雷" : cell.count ? `，周围 ${cell.count} 颗雷` : "，空格" : "，未揭开"}`} onClick={() => reveal(row, col)} onContextMenu={(event) => toggleFlag(event, row, col)}>{content}</button>;
              }))}
            </div></div>
            <div className="game-footer"><span><b className="legend-dot" /> 已揭开 {revealedCount} / {safeCells} 格</span><span>左键揭开 <i>·</i> 右键插旗</span></div>
          </div>
          {notice && <div className={`notice ${gameState === "lost" ? "notice-error" : ""}`}>{notice}{gameState === "won" && <button onClick={() => newGame()}>再来一局 ↗</button>}</div>}
          <p className="privacy-note">排名记录仅保存昵称、难度与完成用时。</p>
        </section>

        <aside className="side-column">
          <section className="panel leaderboard-panel">
            <div className="panel-heading"><div><span className="panel-kicker">GLOBAL RANKING</span><h2>全球排行榜</h2></div><span className="panel-symbol">↗</span></div>
            <div className="rank-tabs">{(Object.keys(PRESETS) as Difficulty[]).map((key) => <button key={key} className={difficulty === key ? "rank-tab selected" : "rank-tab"} onClick={() => chooseDifficulty(key)}>{PRESETS[key].label}</button>)}</div>
            <div className="score-list">
              {globalScores.length ? globalScores.slice(0, 8).map((score, index) => <div key={score.id} className="score-row"><span className={`rank-num ${index < 3 ? `rank-${index + 1}` : ""}`}>{String(index + 1).padStart(2, "0")}</span><span className="score-avatar">{displayName(score).slice(0, 1).toUpperCase()}</span><span className="score-name">{displayName(score)}{score.user_id === player?.id && <small>我</small>}</span><time>{formatTime(score.elapsed_seconds)}</time></div>) : <div className="empty-state"><span>◌</span><p>还没有成绩</p><small>来做第一个上榜的人吧</small></div>}
            </div>
            <div className="panel-bottom">最快用时排在前面 <span>✳</span></div>
          </section>

          <section className="panel account-panel" id="account">
            {player ? <>
              <div className="panel-heading"><div><span className="panel-kicker">YOUR ACCOUNT</span><h2>玩家中心</h2></div><span className="account-badge">● 在线</span></div>
              <div className="welcome-card"><div className="welcome-avatar">{player.username.slice(0, 1).toUpperCase()}</div><div><small>欢迎回来</small><strong>{player.username}</strong></div><span className="welcome-star">✳</span></div>
              <div className="group-section">
                <div className="group-head"><strong>我的群组</strong><span>{groups.length} 个</span></div>
                {groups.length > 0 ? <div className="group-select-wrap"><select value={activeGroup} onChange={(e) => setActiveGroup(e.target.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><span>⌄</span></div> : <p className="group-empty">创建群组或输入邀请码加入。</p>}
                {activeGroupData && <><div className="invite-banner"><div><small>群组邀请码</small><b>{activeGroupData.invite_code}</b></div><button title="复制邀请码" onClick={() => { void navigator.clipboard.writeText(activeGroupData.invite_code); setGroupMessage("邀请码已复制，可以分享给朋友。"); }}>复制</button></div><div className="group-score-title">{activeGroupData.name} · {PRESETS[difficulty].label}榜</div>
                  <div className="group-score-list">{groupScores.slice(0, 5).length ? groupScores.slice(0, 5).map((score, index) => <div key={score.id} className="group-score-row"><span>{index + 1}</span><b>{displayName(score)}</b><time>{formatTime(score.elapsed_seconds)}</time></div>) : <div className="mini-empty">这个难度还没有群内成绩。</div>}</div></>}
                <div className="group-forms"><form onSubmit={createGroup}><input placeholder="新群组名称" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={24} /><button type="submit">＋ 创建</button></form><form onSubmit={joinGroup}><input placeholder="输入邀请码" value={invite} onChange={(e) => setInvite(e.target.value)} maxLength={10} /><button type="submit">加入 ↗</button></form></div>
                {groupMessage && <p className="inline-message">{groupMessage}</p>}
              </div>
            </> : <>
              <div className="panel-heading"><div><span className="panel-kicker">JOIN THE CLUB</span><h2>{authMode === "login" ? "登录玩家账号" : "创建新账号"}</h2></div><span className="panel-symbol">✳</span></div>
              <p className="account-intro">用昵称记录成绩，和群友一起挑战更快纪录。</p>
              <div className="auth-switch"><button className={authMode === "login" ? "auth-active" : ""} onClick={() => { setAuthMode("login"); setAuthError(""); }}>登录</button><button className={authMode === "register" ? "auth-active" : ""} onClick={() => { setAuthMode("register"); setAuthError(""); }}>注册</button></div>
              <form className="auth-form" onSubmit={submitAuth}>
                <label>昵称<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3–18 位字母、数字或下划线" required minLength={3} maxLength={18} /></label>
                <label>密码<input autoComplete={authMode === "login" ? "current-password" : "new-password"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" required minLength={8} maxLength={72} /></label>
                {authError && <p className="form-error">{authError}</p>}
                <button className="primary-button" type="submit" disabled={authBusy}>{authBusy ? "请稍候…" : authMode === "login" ? "登录账号" : "创建账号"}<span>↗</span></button>
              </form>
              <p className="auth-footnote">仅需昵称和密码，不需要邮箱或验证码。忘记密码暂不支持找回。</p>
            </>}
          </section>

          <div className="tip-card"><span>✳</span><div><strong>好运气留给准备充分的人</strong><p>数字告诉你周围有几颗雷。<br />慢一点，观察每个线索。</p></div></div>
        </aside>
      </div>
      <footer className="site-footer"><span>✳ 扫雷俱乐部</span><span>每一格，都是一次判断。</span><span>EST. 2026</span></footer>
    </main>
  );
}
