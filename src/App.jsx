import { useState, useCallback } from "react";

async function callClaude(userPrompt, systemPrompt, images = []) {
  const content = [];
  for (const img of images) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data }
    });
  }
  content.push({ type: "text", text: userPrompt });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "";
}

function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("JSONが見つかりません");
  return JSON.parse(match[0]);
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ data: reader.result.split(",")[1], mediaType: file.type });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const THUMBNAILS = [
  "https://raw.githubusercontent.com/keigo0912/boatrace-predictor/main/public/thumbnails/S_40222801.jpg",
  "https://raw.githubusercontent.com/keigo0912/boatrace-predictor/main/public/thumbnails/S_40222802.jpg",
  "https://raw.githubusercontent.com/keigo0912/boatrace-predictor/main/public/thumbnails/S_40222803.jpg",
  "https://raw.githubusercontent.com/keigo0912/boatrace-predictor/main/public/thumbnails/S_40222804.jpg",
  "https://raw.githubusercontent.com/keigo0912/boatrace-predictor/main/public/thumbnails/S_40222805.jpg",
  "https://raw.githubusercontent.com/keigo0912/boatrace-predictor/main/public/thumbnails/S_40222807.jpg",
  "https://raw.githubusercontent.com/keigo0912/boatrace-predictor/main/public/thumbnails/S_40222808.jpg",
  "https://raw.githubusercontent.com/keigo0912/boatrace-predictor/main/public/thumbnails/S_40222809.jpg",
  "https://raw.githubusercontent.com/keigo0912/boatrace-predictor/main/public/thumbnails/S_40222810.jpg",
  "https://raw.githubusercontent.com/keigo0912/boatrace-predictor/main/public/thumbnails/S_40222811.jpg",
];

const VENUES = [
  "桐生","戸田","江戸川","平和島","多摩川","浜名湖","蒲郡","常滑",
  "津","三国","びわこ","住之江","尼崎","鳴門","丸亀","児島",
  "宮島","徳山","下関","若松","芦屋","福岡","唐津","大村"
];

export default function BoatRacePredictor() {
  const [venue, setVenue] = useState("");
  const [raceNo, setRaceNo] = useState("");
  const [deadline, setDeadline] = useState("");
  const [oddsImage, setOddsImage] = useState(null);
  const [beforeImage, setBeforeImage] = useState(null);
  const [oddsPreview, setOddsPreview] = useState(null);
  const [beforePreview, setBeforePreview] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);
  const [thumbnail, setThumbnail] = useState(null);

  const handleOddsImage = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    setOddsImage(file);
    setOddsPreview(URL.createObjectURL(file));
    setPrediction(null);
    setError(null);
  }, []);

  const handleBeforeImage = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBeforeImage(file);
    setBeforePreview(URL.createObjectURL(file));
    setPrediction(null);
    setError(null);
  }, []);

  const generatePrediction = useCallback(async () => {
    if (!oddsImage || !beforeImage) {
      setError("オッズと展示情報の画像を両方アップロードしてください");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [oddsB64, beforeB64] = await Promise.all([
        fileToBase64(oddsImage),
        fileToBase64(beforeImage),
      ]);

      const d = new Date();
      const dateStr = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;

      const prompt = `以下の2枚の画像から競艇の予想を立ててください。

1枚目：3連単オッズ（人気順）の画像
2枚目：展示情報（展示タイム・ST・天候）の画像

レース情報：
- 日付：${dateStr}
- レース場：${venue || "画像から読み取ってください"}
- レース番号：${raceNo || "画像から読み取ってください"}
- 締切時刻：${deadline || "画像から読み取ってください"}

画像から以下を読み取って分析してください：
- オッズ人気順上位の組番とオッズ
- 各艇の展示タイム・スタートタイミング・進入コース
- 天候・風向・風速・波高

以下のJSON形式のみで回答してください：
{
  "picks": [
    {"rank": 1, "combination": "X-Y-Z"},
    {"rank": 2, "combination": "X-Y-Z"},
    {"rank": 3, "combination": "X-Y-Z"},
    {"rank": 4, "combination": "X-Y-Z"},
    {"rank": 5, "combination": "X-Y-Z"}
  ],
  "proComment": "競艇のプロとしての見立てコメント。展示タイム・ST・オッズ・天候を踏まえた具体的な分析を200字程度で。"
}`;

      const result = await callClaude(
        prompt,
        "あなたはプロ競艇予想師AIです。画像を詳細に分析してJSON形式のみで回答してください。",
        [oddsB64, beforeB64]
      );
      const parsed = parseJSON(result);
      const d2 = new Date();
      parsed.dateStr = `${d2.getFullYear()}年${d2.getMonth()+1}月${d2.getDate()}日`;
      parsed.venue = venue;
      parsed.raceNo = raceNo;
      parsed.deadline = deadline;
      setPrediction(parsed);
    } catch (e) {
      setError("予想生成失敗: " + e.message);
    }
    setLoading(false);
  }, [oddsImage, beforeImage, venue, raceNo, deadline]);

  const copyTitle = useCallback(() => {
    if (!prediction) return;
    const title = `${prediction.dateStr} ${prediction.venue}${prediction.raceNo} ${prediction.deadline}〆切`;
    navigator.clipboard.writeText(title).then(() => {
      setCopiedTitle(true);
      setTimeout(() => setCopiedTitle(false), 3000);
    });
  }, [prediction]);

  const copyBody = useCallback(() => {
    if (!prediction) return;
    const body = [
      ...(prediction.picks || []).map((p, i) => `${i+1}. ${p.combination}`),
      "",
      prediction.proComment,
    ].join("\n");
    navigator.clipboard.writeText(body).then(() => {
      setCopiedBody(true);
      setTimeout(() => setCopiedBody(false), 3000);
    });
  }, [prediction]);

  const randomThumb = useCallback(() => {
    const idx = Math.floor(Math.random() * THUMBNAILS.length);
    setThumbnail(THUMBNAILS[idx]);
  }, []);

  const colors = ["#ffd700","#c0c0c0","#cd7f32","#aaddff","#ffaacc"];
  const labels = ["1点目","2点目","3点目","4点目","5点目"];
  return (
    <div style={{ minHeight:"100vh", background:"#0b0f1a", fontFamily:"'Noto Sans JP',sans-serif", color:"#dce8ff", padding:"16px", maxWidth:"640px", margin:"0 auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&family=Rajdhani:wght@600;700&display=swap" rel="stylesheet" />

      <div style={{ textAlign:"center", marginBottom:"22px", paddingTop:"8px" }}>
        <div style={{ fontSize:"10px", letterSpacing:"5px", color:"#3a7bd5", marginBottom:"6px" }}>BOAT RACE AI ANALYSIS</div>
        <h1 style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:"30px", fontWeight:700, margin:0, background:"linear-gradient(90deg,#3a7bd5,#00c6fb)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>PREDICTOR</h1>
        <div style={{ height:"1px", background:"linear-gradient(90deg,transparent,#3a7bd5,transparent)", marginTop:"10px" }} />
      </div>

      {/* レース情報入力フォーム */}
      <div style={{ background:"rgba(58,123,213,0.07)", border:"1px solid rgba(58,123,213,0.25)", borderRadius:"14px", padding:"18px", marginBottom:"16px" }}>
        <div style={{ fontSize:"11px", color:"#3a7bd5", letterSpacing:"2px", marginBottom:"14px" }}>📝 レース情報を入力</div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"10px" }}>
          {/* レース場 */}
          <div style={{ gridColumn:"1 / -1" }}>
            <label style={{ fontSize:"11px", color:"#3a7bd5", display:"block", marginBottom:"6px" }}>レース場</label>
            <select
              value={venue}
              onChange={e => setVenue(e.target.value)}
              style={{ width:"100%", padding:"10px 12px", background:"#131929", border:"1px solid rgba(58,123,213,0.3)", borderRadius:"8px", color: venue ? "#dce8ff" : "#555", fontSize:"15px" }}
            >
              <option value="" style={{background:"#131929"}}>選択してください</option>
              {VENUES.map(v => <option key={v} value={v} style={{background:"#131929"}}>{v}</option>)}
            </select>
          </div>

          {/* レース番号 */}
          <div>
            <label style={{ fontSize:"11px", color:"#3a7bd5", display:"block", marginBottom:"6px" }}>レース番号</label>
            <select
              value={raceNo}
              onChange={e => setRaceNo(e.target.value)}
              style={{ width:"100%", padding:"10px 12px", background:"#131929", border:"1px solid rgba(58,123,213,0.3)", borderRadius:"8px", color: raceNo ? "#dce8ff" : "#555", fontSize:"15px" }}
            >
              <option value="" style={{background:"#131929"}}>選択</option>
              {[...Array(12)].map((_,i) => (
                <option key={i+1} value={`${i+1}R`} style={{background:"#131929"}}>{i+1}R</option>
              ))}
            </select>
          </div>

          {/* 締切時刻 */}
          <div>
            <label style={{ fontSize:"11px", color:"#3a7bd5", display:"block", marginBottom:"6px" }}>締切時刻</label>
            <input
              type="time"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              style={{ width:"100%", padding:"10px 12px", background:"#131929", border:"1px solid rgba(58,123,213,0.3)", borderRadius:"8px", color:"#dce8ff", fontSize:"15px", boxSizing:"border-box" }}
            />
          </div>
        </div>
      </div>

      {/* 画像アップロード */}
      <div style={{ background:"rgba(58,123,213,0.07)", border:"1px solid rgba(58,123,213,0.25)", borderRadius:"14px", padding:"18px", marginBottom:"16px" }}>
        <div style={{ fontSize:"11px", color:"#3a7bd5", letterSpacing:"2px", marginBottom:"14px" }}>📷 スクショをアップロード</div>

        <div style={{ display:"grid", gap:"12px", marginBottom:"16px" }}>
          <div>
            <div style={{ fontSize:"11px", color:"#3a7bd5", marginBottom:"8px" }}>① オッズ画像（人気順）</div>
            <label style={{
              display:"block", padding:"16px", textAlign:"center",
              background: oddsPreview ? "rgba(0,255,136,0.05)" : "rgba(58,123,213,0.08)",
              border:`2px dashed ${oddsPreview ? "rgba(0,255,136,0.5)" : "rgba(58,123,213,0.4)"}`,
              borderRadius:"10px", cursor:"pointer",
            }}>
              <input type="file" accept="image/*" onChange={handleOddsImage} style={{ display:"none" }} />
              {oddsPreview ? (
                <div>
                  <img src={oddsPreview} alt="オッズ" style={{ maxWidth:"100%", maxHeight:"180px", borderRadius:"6px", marginBottom:"6px" }} />
                  <div style={{ fontSize:"11px", color:"#00ff88" }}>✅ アップロード済み（タップで変更）</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize:"24px", marginBottom:"8px" }}>📊</div>
                  <div style={{ color:"#3a7bd5", fontSize:"14px" }}>タップして選択</div>
                </div>
              )}
            </label>
          </div>

          <div>
            <div style={{ fontSize:"11px", color:"#00c6fb", marginBottom:"8px" }}>② 展示情報画像</div>
            <label style={{
              display:"block", padding:"16px", textAlign:"center",
              background: beforePreview ? "rgba(0,255,136,0.05)" : "rgba(0,198,251,0.08)",
              border:`2px dashed ${beforePreview ? "rgba(0,255,136,0.5)" : "rgba(0,198,251,0.4)"}`,
              borderRadius:"10px", cursor:"pointer",
            }}>
              <input type="file" accept="image/*" onChange={handleBeforeImage} style={{ display:"none" }} />
              {beforePreview ? (
                <div>
                  <img src={beforePreview} alt="展示情報" style={{ maxWidth:"100%", maxHeight:"180px", borderRadius:"6px", marginBottom:"6px" }} />
                  <div style={{ fontSize:"11px", color:"#00ff88" }}>✅ アップロード済み（タップで変更）</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize:"24px", marginBottom:"8px" }}>🌊</div>
                  <div style={{ color:"#00c6fb", fontSize:"14px" }}>タップして選択</div>
                </div>
              )}
            </label>
          </div>
        </div>

        <button
          onClick={generatePrediction}
          disabled={loading || !oddsImage || !beforeImage}
          style={{
            width:"100%", padding:"16px",
            background: loading ? "rgba(255,215,0,0.05)" : (!oddsImage || !beforeImage) ? "rgba(255,255,255,0.03)" : "rgba(255,215,0,0.12)",
            border:`1px solid ${loading ? "rgba(255,215,0,0.3)" : (!oddsImage || !beforeImage) ? "rgba(255,255,255,0.1)" : "rgba(255,215,0,0.5)"}`,
            borderRadius:"12px", cursor:(!oddsImage || !beforeImage || loading) ? "not-allowed" : "pointer",
            color:(!oddsImage || !beforeImage) ? "#555" : "#ffd700",
            fontSize:"16px", fontWeight:700,
            opacity:(!oddsImage || !beforeImage) ? 0.4 : 1,
            transition:"all 0.2s",
          }}
        >
          {loading ? "⏳ AI予想を生成中..." : "🏆 AI予想を生成する"}
        </button>
      </div>

      {error && (
        <div style={{ background:"rgba(255,80,80,0.08)", border:"1px solid rgba(255,80,80,0.3)", borderRadius:"10px", padding:"13px", marginBottom:"14px", color:"#ff9999", fontSize:"13px" }}>
          ⚠ {error}
        </div>
      )}
       {prediction && (
        <div style={{ background:"rgba(255,255,255,0.025)", borderRadius:"14px", border:"1px solid rgba(255,215,0,0.25)", borderTop:"3px solid #ffd700", padding:"20px", marginBottom:"16px" }}>
          <h2 style={{ margin:"0 0 16px", fontSize:"15px", color:"#ffd700", fontWeight:700 }}>🏆 AI予想（5点）</h2>

          {/* レース情報表示 */}
          <div style={{ background:"rgba(255,215,0,0.06)", border:"1px solid rgba(255,215,0,0.2)", borderRadius:"10px", padding:"12px 16px", marginBottom:"16px", fontSize:"13px", color:"#ffd700" }}>
            📍 {prediction.dateStr} {prediction.venue}{prediction.raceNo} {prediction.deadline && `${prediction.deadline}〆切`}
          </div>

          {/* 5点予想 */}
          <div style={{ display:"grid", gap:"8px", marginBottom:"20px" }}>
            {prediction.picks?.map((p, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:"14px", background:`${colors[i]}08`, border:`1px solid ${colors[i]}30`, borderRadius:"10px", padding:"13px 16px" }}>
                <span style={{ fontSize:"11px", color:colors[i], fontWeight:700, width:"40px" }}>{labels[i]}</span>
                <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:"26px", fontWeight:700, color:colors[i], letterSpacing:"1px" }}>{p.combination}</span>
                <span style={{ fontSize:"11px", color:"#555", marginLeft:"auto" }}>3連単</span>
              </div>
            ))}
          </div>

          {/* プロコメント */}
          <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"10px", padding:"16px", marginBottom:"20px" }}>
            <div style={{ fontSize:"10px", color:"#3a7bd5", letterSpacing:"2px", marginBottom:"10px" }}>プロの見立て</div>
            <div style={{ fontSize:"13px", color:"#c0d8ff", lineHeight:"1.9" }}>{prediction.proComment}</div>
          </div>

          {/* noteコピーボタン */}
          <div style={{ fontSize:"11px", color:"#3a7bd5", letterSpacing:"2px", marginBottom:"10px" }}>📋 noteへコピー</div>

          {/* 題名コピー */}
          <button onClick={copyTitle} style={{
            width:"100%", padding:"13px", marginBottom:"8px",
            background: copiedTitle ? "rgba(0,255,136,0.12)" : "rgba(58,123,213,0.08)",
            border:`1px solid ${copiedTitle ? "rgba(0,255,136,0.5)" : "rgba(58,123,213,0.35)"}`,
            borderRadius:"10px", cursor:"pointer", transition:"all 0.3s",
            color: copiedTitle ? "#00ff88" : "#3a7bd5", fontSize:"14px", fontWeight:700,
          }}>
            {copiedTitle ? "✅ 題名コピー完了！" : "① 題名をコピー"}
          </button>
          {copiedTitle && (
            <div style={{ fontSize:"11px", color:"#555", textAlign:"center", marginBottom:"8px", padding:"6px", background:"rgba(255,255,255,0.03)", borderRadius:"6px" }}>
              {prediction.dateStr} {prediction.venue}{prediction.raceNo} {prediction.deadline}〆切
            </div>
          )}

          {/* 本文コピー */}
          <button onClick={copyBody} style={{
            width:"100%", padding:"13px", marginBottom:"8px",
            background: copiedBody ? "rgba(0,255,136,0.12)" : "rgba(255,215,0,0.08)",
            border:`1px solid ${copiedBody ? "rgba(0,255,136,0.5)" : "rgba(255,215,0,0.35)"}`,
            borderRadius:"10px", cursor:"pointer", transition:"all 0.3s",
            color: copiedBody ? "#00ff88" : "#ffd700", fontSize:"14px", fontWeight:700,
          }}>
            {copiedBody ? "✅ 本文コピー完了！" : "② 本文をコピー"}
          </button>

             {/* サムネイル */}
          <div style={{ marginBottom:"16px" }}>
            <div style={{ fontSize:"11px", color:"#3a7bd5", letterSpacing:"2px", marginBottom:"10px" }}>🖼 noteサムネイル</div>
            <button onClick={randomThumb} style={{
              width:"100%", padding:"12px",
              background:"rgba(58,123,213,0.08)", border:"1px solid rgba(58,123,213,0.35)",
              borderRadius:"10px", cursor:"pointer", color:"#3a7bd5",
              fontSize:"14px", fontWeight:700, marginBottom:"10px",
            }}>
              🎲 サムネイルをランダム選択
            </button>
            {thumbnail && (
              <div style={{ textAlign:"center" }}>
                <img src={thumbnail} alt="サムネイル" style={{ maxWidth:"100%", maxHeight:"200px", borderRadius:"10px", marginBottom:"10px" }} />
                <a
                  href={thumbnail}
                  download
                  style={{
                    display:"block", padding:"11px",
                    background:"rgba(0,198,251,0.08)", border:"1px solid rgba(0,198,251,0.35)",
                    borderRadius:"10px", color:"#00c6fb",
                    fontSize:"13px", fontWeight:700, textDecoration:"none", textAlign:"center",
                  }}
                >
                  ⬇ この画像をダウンロード
                </a>
              </div>
            )}
          </div>

          {/* noteを開くボタン */}
          {(copiedTitle || copiedBody) && (
            <button
              onClick={() => window.open("https://note.com/notes/new", "_blank")}
              style={{ width:"100%", padding:"12px", background:"rgba(65,161,108,0.1)", border:"1px solid rgba(65,161,108,0.4)", borderRadius:"10px", cursor:"pointer", color:"#41a16c", fontSize:"14px", fontWeight:700 }}
            >
              📝 noteの新規作成ページを開く →
            </button>
          )}
        </div>
      )}

      <div style={{ textAlign:"center", marginTop:"28px", fontSize:"10px", color:"#333", lineHeight:"2" }}>
        競艇は余裕の範囲でお楽しみください。
      </div>
    </div>
  );
}
