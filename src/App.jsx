import { useState, useCallback } from "react";

const VENUES = [
  { code: "01", name: "桐生" }, { code: "02", name: "戸田" },
  { code: "03", name: "江戸川" }, { code: "04", name: "平和島" },
  { code: "05", name: "多摩川" }, { code: "06", name: "浜名湖" },
  { code: "07", name: "蒲郡" }, { code: "08", name: "常滑" },
  { code: "09", name: "津" }, { code: "10", name: "三国" },
  { code: "11", name: "びわこ" }, { code: "12", name: "住之江" },
  { code: "13", name: "尼崎" }, { code: "14", name: "鳴門" },
  { code: "15", name: "丸亀" }, { code: "16", name: "児島" },
  { code: "17", name: "宮島" }, { code: "18", name: "徳山" },
  { code: "19", name: "下関" }, { code: "20", name: "若松" },
  { code: "21", name: "芦屋" }, { code: "22", name: "福岡" },
  { code: "23", name: "唐津" }, { code: "24", name: "大村" },
];

const TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
})();

async function callClaude(userPrompt, systemPrompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "";
}

function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("JSONが見つかりません: " + clean.slice(0, 100));
  return JSON.parse(match[0]);
}
export default function BoatRacePredictor() {
  const [venueCode, setVenueCode] = useState("07");
  const [raceNo, setRaceNo] = useState("1");
  const [oddsData, setOddsData] = useState(null);
  const [beforeData, setBeforeData] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState({ odds: false, before: false, predict: false });
  const [error, setError] = useState(null);
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);

  const venueName = VENUES.find(v => v.code === venueCode)?.name || "";
  const oddsUrl = `https://www.boatrace.jp/owpc/pc/race/odds3t?rno=${raceNo}&jcd=${venueCode}&hd=${TODAY}`;
  const beforeUrl = `https://www.boatrace.jp/owpc/pc/race/beforeinfo?rno=${raceNo}&jcd=${venueCode}&hd=${TODAY}`;

  const reset = () => { setStep(0); setOddsData(null); setBeforeData(null); setPrediction(null); setError(null); };

  const fetchOdds = useCallback(async () => {
    setLoading(l => ({ ...l, odds: true }));
    setError(null);
    try {
      const prompt = `boatrace.jp公式の3連単オッズページにアクセスして情報を取得してください。
URL: ${oddsUrl}
人気順（オッズが低い順）上位10点を取得し、以下のJSON形式のみで返答してください：
{
  "raceInfo": "レース名やグレード",
  "topOdds": [
    {"rank": 1, "combination": "1-2-3", "odds": "5.6"},
    ...10点
  ],
  "favoriteBoat": 1番人気の1着艇番(数字のみ),
  "summary": "オッズから読み取れる傾向（60字以内）"
}`;
      const result = await callClaude(prompt, "あなたは競艇情報収集AIです。指定URLを検索・取得しJSON形式のみで回答してください。");
      setOddsData(parseJSON(result));
      setStep(1);
    } catch (e) {
      setError("オッズ取得失敗: " + e.message);
    }
    setLoading(l => ({ ...l, odds: false }));
  }, [oddsUrl]);

  const fetchBefore = useCallback(async () => {
    setLoading(l => ({ ...l, before: true }));
    setError(null);
    try {
      const prompt = `boatrace.jp公式の直前情報ページにアクセスして展示情報を取得してください。
URL: ${beforeUrl}
以下のJSON形式のみで返答してください：
{
  "weather": "天候",
  "wind": "風向・風速",
  "wave": "波高",
  "boats": [
    {"no": 1, "playerName": "選手名", "exhibitionTime": "6.70", "startTiming": "0.15", "course": 1},
    ...6艇分
  ],
  "fastestBoat": 展示タイム最速艇番(数字),
  "bestStartBoat": ST最良艇番(数字),
  "summary": "直前情報から読み取れる重要ポイント（80字以内）"
}`;
      const result = await callClaude(prompt, "あなたは競艇情報収集AIです。指定URLを検索・取得しJSON形式のみで回答してください。");
      setBeforeData(parseJSON(result));
      setStep(2);
    } catch (e) {
      setError("直前情報取得失敗: " + e.message);
    }
    setLoading(l => ({ ...l, before: false }));
  }, [beforeUrl]);

  const generatePrediction = useCallback(async () => {
    if (!oddsData || !beforeData) return;
    setLoading(l => ({ ...l, predict: true }));
    setError(null);
    try {
      const prompt = `競艇${venueName}${raceNo}R の予想を立ててください。
【オッズ情報】
レース: ${oddsData.raceInfo}
人気上位: ${JSON.stringify(oddsData.topOdds)}
1着人気艇: ${oddsData.favoriteBoat}号艇
傾向: ${oddsData.summary}
【直前情報】
天候:${beforeData.weather} 風:${beforeData.wind} 波:${beforeData.wave}
展示最速: ${beforeData.fastestBoat}号艇 / ST最良: ${beforeData.bestStartBoat}号艇
各艇: ${JSON.stringify(beforeData.boats)}
ポイント: ${beforeData.summary}
以下のJSON形式のみで回答してください：
{
  "picks": [
    {"rank": 1, "combination": "X-Y-Z"},
    {"rank": 2, "combination": "X-Y-Z"},
    {"rank": 3, "combination": "X-Y-Z"},
    {"rank": 4, "combination": "X-Y-Z"},
    {"rank": 5, "combination": "X-Y-Z"}
  ],
  "proComment": "競艇のプロとしての見立てコメント。レース展開・注目艇・狙いどころを具体的に200字程度で記述。"
}`;
      const result = await callClaude(prompt, "あなたはプロ競艇予想師AIです。データを客観的に分析しJSON形式のみで回答してください。");
      setPrediction(parseJSON(result));
      setStep(3);
    } catch (e) {
      setError("予想生成失敗: " + e.message);
    }
    setLoading(l => ({ ...l, predict: false }));
  }, [oddsData, beforeData, venueName, raceNo]);

  const boatBg = ["#fff","#000","#e00","#00e","#d0d000","#006600"];
  const boatFg = ["#000","#fff","#fff","#fff","#000","#fff"];
  return (
    <div style={{ minHeight:"100vh", background:"#0b0f1a", fontFamily:"'Noto Sans JP',sans-serif", color:"#dce8ff", padding:"16px", maxWidth:"640px", margin:"0 auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&family=Rajdhani:wght@600;700&display=swap" rel="stylesheet" />
      <div style={{ textAlign:"center", marginBottom:"22px", paddingTop:"8px" }}>
        <div style={{ fontSize:"10px", letterSpacing:"5px", color:"#3a7bd5", marginBottom:"6px" }}>BOAT RACE AI ANALYSIS</div>
        <h1 style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:"30px", fontWeight:700, margin:0, background:"linear-gradient(90deg,#3a7bd5,#00c6fb)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>PREDICTOR</h1>
        <div style={{ height:"1px", background:"linear-gradient(90deg,transparent,#3a7bd5,transparent)", marginTop:"10px" }} />
      </div>
      <div style={{ background:"rgba(58,123,213,0.07)", border:"1px solid rgba(58,123,213,0.25)", borderRadius:"14px", padding:"18px", marginBottom:"16px" }}>
        <div style={{ display:"flex", gap:"12px", marginBottom:"12px" }}>
          <div style={{ flex:2 }}>
            <label style={{ fontSize:"10px", color:"#3a7bd5", letterSpacing:"2px", display:"block", marginBottom:"6px" }}>レース場</label>
            <select value={venueCode} onChange={e=>{ setVenueCode(e.target.value); reset(); }}
              style={{ width:"100%", padding:"10px 12px", background:"#131929", border:"1px solid rgba(58,123,213,0.3)", borderRadius:"8px", color:"#dce8ff", fontSize:"15px" }}>
              {VENUES.map(v=><option key={v.code} value={v.code} style={{background:"#131929"}}>{v.name}</option>)}
            </select>
          </div>
          <div style={{ flex:1 }}>
            <label style={{ fontSize:"10px", color:"#3a7bd5", letterSpacing:"2px", display:"block", marginBottom:"6px" }}>レース</label>
            <select value={raceNo} onChange={e=>{ setRaceNo(e.target.value); reset(); }}
              style={{ width:"100%", padding:"10px 12px", background:"#131929", border:"1px solid rgba(58,123,213,0.3)", borderRadius:"8px", color:"#dce8ff", fontSize:"15px" }}>
              {[...Array(12)].map((_,i)=><option key={i+1} value={String(i+1)} style={{background:"#131929"}}>{i+1}R</option>)}
            </select>
          </div>
        </div>
        <div style={{ fontSize:"10px", color:"#334", background:"#0d1120", borderRadius:"8px", padding:"10px 12px", marginBottom:"14px", lineHeight:"1.9", wordBreak:"break-all" }}>
          <span style={{color:"#3a7bd5"}}>オッズURL: </span>{oddsUrl}<br/>
          <span style={{color:"#00c6fb"}}>直前情報URL: </span>{beforeUrl}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
          <Btn label="① オッズ取得" sub="公式サイトの人気順・オッズを分析" step={1} cur={step} loading={loading.odds} onClick={fetchOdds} disabled={false} />
          <Btn label="② 直前情報取得" sub="展示タイム・ST取得（出走10分前〜有効）" step={2} cur={step} loading={loading.before} onClick={fetchBefore} disabled={step<1} />
          <Btn label="③ AI予想を生成" sub="両データを統合して3連単予想を出力" step={3} cur={step} loading={loading.predict} onClick={generatePrediction} disabled={step<2} highlight />
        </div>
      </div>
      {error && <div style={{ background:"rgba(255,80,80,0.08)", border:"1px solid rgba(255,80,80,0.3)", borderRadius:"10px", padding:"13px", marginBottom:"14px", color:"#ff9999", fontSize:"13px" }}>⚠ {error}</div>}
      {oddsData && (
        <Card title="📊 オッズ分析" accent="#3a7bd5">
          <div style={{ fontSize:"11px", color:"#7a9fd5", marginBottom:"11px" }}>{oddsData.raceInfo}</div>
          <div style={{ display:"grid", gap:"5px", marginBottom:"12px" }}>
            {oddsData.topOdds?.slice(0,10).map((o,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:"10px", background:i===0?"rgba(58,123,213,0.12)":"rgba(255,255,255,0.02)", border:`1px solid ${i===0?"rgba(58,123,213,0.4)":"rgba(255,255,255,0.06)"}`, borderRadius:"8px", padding:"8px 14px" }}>
                <span style={{ fontSize:"11px", color:"#555", width:"52px" }}>{i+1}番人気</span>
                <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:"17px", fontWeight:700, color:i===0?"#00c6fb":"#c0d8ff", flex:1 }}>{o.combination}</span>
                <span style={{ fontSize:"15px", fontWeight:700, color:i<3?"#ffd700":"#777" }}>{o.odds}倍</span>
              </div>
            ))}
          </div>
          <Note>{oddsData.summary}</Note>
        </Card>
      )}
      {beforeData && (
        <Card title="🌊 直前情報" accent="#00c6fb">
          <div style={{ display:"flex", gap:"10px", flexWrap:"wrap", marginBottom:"14px" }}>
            {[["天候",beforeData.weather],["風",beforeData.wind],["波",beforeData.wave]].map(([k,v],i)=>(
              <div key={i} style={{ background:"rgba(0,198,251,0.07)", border:"1px solid rgba(0,198,251,0.2)", borderRadius:"8px", padding:"8px 14px", textAlign:"center" }}>
                <div style={{ fontSize:"10px", color:"#00c6fb", marginBottom:"3px" }}>{k}</div>
                <div style={{ fontSize:"14px", fontWeight:700 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display:"grid", gap:"5px" }}>
            {beforeData.boats?.map((b,i)=>{
              const fast = b.no===beforeData.fastestBoat;
              const st = b.no===beforeData.bestStartBoat;
              return (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"26px 1fr 68px 64px 1fr", gap:"8px", alignItems:"center", background:fast?"rgba(0,198,251,0.09)":"rgba(255,255,255,0.025)", border:`1px solid ${fast?"rgba(0,198,251,0.35)":"rgba(255,255,255,0.06)"}`, borderRadius:"8px", padding:"9px 12px", fontSize:"13px" }}>
                  <span style={{ width:"22px", height:"22px", borderRadius:"50%", background:boatBg[i]||"#444", color:boatFg[i]||"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"11px", fontWeight:900 }}>{b.no}</span>
                  <span style={{ color:"#c0d8ff", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.playerName}</span>
                  <div style={{ textAlign:"right" }}>
                    <span style={{ fontSize:"10px", color:"#444" }}>展示 </span>
                    <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:"15px", fontWeight:700, color:fast?"#00c6fb":"#dce8ff" }}>{b.exhibitionTime}</span>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <span style={{ fontSize:"10px", color:"#444" }}>ST </span>
                    <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:"14px", color:st?"#ffd700":"#888" }}>{b.startTiming}</span>
                  </div>
                  <div style={{ display:"flex", gap:"5px", flexWrap:"wrap" }}>
                    {fast && <Tag color="#00c6fb">展示⚡</Tag>}
                    {st && <Tag color="#ffd700">ST◎</Tag>}
                  </div>
                </div>
              );
            })}
          </div>
          <Note style={{marginTop:"12px"}}>{beforeData.summary}</Note>
        </Card>
      )}
      {prediction && (
        <Card title="🏆 AI予想（5点）" accent="#ffd700">
          <div style={{ display:"grid", gap:"8px", marginBottom:"20px" }}>
            {prediction.picks?.map((p, i) => {
              const colors = ["#ffd700","#c0c0c0","#cd7f32","#aaddff","#ffaacc"];
              const labels = ["1点目","2点目","3点目","4点目","5点目"];
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:"14px", background:`${colors[i]}08`, border:`1px solid ${colors[i]}30`, borderRadius:"10px", padding:"13px 16px" }}>
                  <span style={{ fontSize:"11px", color:colors[i], fontWeight:700, width:"40px" }}>{labels[i]}</span>
                  <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:"26px", fontWeight:700, color:colors[i], letterSpacing:"1px" }}>{p.combination}</span>
                  <span style={{ fontSize:"11px", color:"#555", marginLeft:"auto" }}>3連単</span>
                </div>
              );
            })}
          </div>
          <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"10px", padding:"16px" }}>
            <div style={{ fontSize:"10px", color:"#3a7bd5", letterSpacing:"2px", marginBottom:"10px" }}>プロの見立て</div>
            <div style={{ fontSize:"13px", color:"#c0d8ff", lineHeight:"1.9" }}>{prediction.proComment}</div>
          </div>
          <button
            onClick={() => {
              const d = new Date();
              const dateStr = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
              const text = [
                `${dateStr} ${venueName}${raceNo}R`,
                "",
                ...(prediction.picks || []).map((p, i) => `${i+1}. ${p.combination}`),
                "",
                prediction.proComment,
              ].join("\n");
              navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 4000);
              });
            }}
            style={{ width:"100%", marginTop:"16px", padding:"14px", background:copied?"rgba(0,255,136,0.12)":"rgba(255,255,255,0.05)", border:`1px solid ${copied?"rgba(0,255,136,0.5)":"rgba(255,255,255,0.15)"}`, borderRadius:"10px", cursor:"pointer", transition:"all 0.3s", color:copied?"#00ff88":"#c0d8ff", fontSize:"15px", fontWeight:700 }}
          >
            {copied ? "✅ コピー完了！noteに貼り付けてください" : "📋 note用テキストをコピー"}
          </button>
          {copied && (
            <button
              onClick={() => window.open("https://note.com/notes/new", "_blank")}
              style={{ width:"100%", marginTop:"8px", padding:"12px", background:"rgba(65,161,108,0.1)", border:"1px solid rgba(65,161,108,0.4)", borderRadius:"10px", cursor:"pointer", color:"#41a16c", fontSize:"14px", fontWeight:700 }}
            >
              📝 noteの新規作成ページを開く →
            </button>
          )}
        </Card>
      )}
      <div style={{ textAlign:"center", marginTop:"28px", fontSize:"10px", color:"#333", lineHeight:"2" }}>
        ⚠ 本予想はAIによる参考情報です。舟券の購入は自己責任でお願いします。<br/>
        競艇は余裕の範囲でお楽しみください。
      </div>
    </div>
  );
}

function Btn({ label, sub, step, cur, loading, onClick, disabled, highlight }) {
  const done = cur >= step;
  const active = cur === step-1 || done;
  return (
    <button onClick={onClick} disabled={disabled||loading} style={{ width:"100%", padding:"13px 16px", textAlign:"left", background:done?"rgba(0,255,136,0.07)":highlight&&active?"rgba(255,215,0,0.08)":active?"rgba(58,123,213,0.08)":"rgba(255,255,255,0.02)", border:`1px solid ${done?"rgba(0,255,136,0.35)":highlight&&active?"rgba(255,215,0,0.4)":active?"rgba(58,123,213,0.35)":"rgba(255,255,255,0.07)"}`, borderRadius:"10px", cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.35:1, transition:"all 0.2s" }}>
      <div style={{ fontSize:"14px", fontWeight:700, color:done?"#00ff88":highlight&&active?"#ffd700":active?"#3a7bd5":"#555", marginBottom:"3px" }}>
        {loading?"⏳ 取得中...":done?"✅ "+label:label}
      </div>
      <div style={{ fontSize:"11px", color:"#445" }}>{sub}</div>
    </button>
  );
}

function Card({ title, accent, children }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.025)", borderRadius:"14px", border:`1px solid ${accent}25`, borderTop:`3px solid ${accent}`, padding:"20px", marginBottom:"16px" }}>
      <h2 style={{ margin:"0 0 16px", fontSize:"15px", color:accent, fontWeight:700 }}>{title}</h2>
      {children}
    </div>
  );
}

function Note({ children, style }) {
  return <div style={{ fontSize:"12px", color:"#8aa0c0", background:"rgba(255,255,255,0.03)", padding:"10px 14px", borderRadius:"8px", lineHeight:"1.7", ...style }}>💡 {children}</div>;
}

function Tag({ color, children }) {
  return <span style={{ fontSize:"10px", padding:"2px 7px", borderRadius:"4px", background:`${color}18`, border:`1px solid ${color}50`, color, whiteSpace:"nowrap" }}>{children}</span>;
}
