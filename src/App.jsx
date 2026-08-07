import React, { useState, useEffect, useMemo, useCallback } from "react";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import logoSrc from "./logo.jpg";

const JUNIOR = [
  ["JSS1 A", "JSS1 B", "JSS1 C"],
  ["JSS2 A", "JSS2 B", "JSS2 C"],
  ["JSS3 A", "JSS3 B", "JSS3 C"],
];
const SENIOR = [
  ["SS1 Science", "SS1 Art", "SS1 Commercial"],
  ["SS2 Science", "SS2 Art", "SS2 Commercial"],
  ["SS3 Science", "SS3 Art", "SS3 Commercial"],
];
const ALL_CLASSES = [...JUNIOR.flat(), ...SENIOR.flat()];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isWeekday(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
}

function formatDisplayDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  const dow = DAY_NAMES[d.getDay()];
  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "long" });
  const year = d.getFullYear();
  return `${dow}, ${day} ${month} ${year}`;
}

function emptyRow() {
  return { boys: "", girls: "" };
}

function emptyRecord() {
  const rec = {};
  ALL_CLASSES.forEach((c) => (rec[c] = emptyRow()));
  return rec;
}

function numOf(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

const COLLECTION_NAME = "attendance";

export default function App() {
  const todayISO = toISODate(new Date());
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [record, setRecord] = useState(emptyRecord());
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle");
  const [recordedDates, setRecordedDates] = useState([]);
  const [view, setView] = useState("entry");
  const [historyEntry, setHistoryEntry] = useState(null);
  const [toast, setToast] = useState(null);
  const [connectionError, setConnectionError] = useState(false);

  const weekday = isWeekday(selectedDate);

  const refreshDateList = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      const dates = snap.docs.map((d) => d.id).sort().reverse();
      setRecordedDates(dates);
      setConnectionError(false);
    } catch (e) {
      console.error("Failed to load date list", e);
      setConnectionError(true);
    }
  }, []);

  useEffect(() => {
    refreshDateList();
  }, [refreshDateList]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, COLLECTION_NAME, selectedDate));
        if (!cancelled) {
          if (snap.exists()) {
            const data = snap.data();
            const merged = emptyRecord();
            ALL_CLASSES.forEach((c) => {
              if (data[c]) {
                merged[c] = { boys: String(data[c].boys ?? ""), girls: String(data[c].girls ?? "") };
              }
            });
            setRecord(merged);
          } else {
            setRecord(emptyRecord());
          }
          setConnectionError(false);
        }
      } catch (e) {
        console.error("Failed to load record", e);
        if (!cancelled) {
          setRecord(emptyRecord());
          setConnectionError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const updateCell = (className, field, value) => {
    const cleaned = value.replace(/[^0-9]/g, "").slice(0, 4);
    setRecord((prev) => ({
      ...prev,
      [className]: { ...prev[className], [field]: cleaned },
    }));
  };

  const totals = useMemo(() => {
    let boys = 0,
      girls = 0;
    const perClass = {};
    ALL_CLASSES.forEach((c) => {
      const b = numOf(record[c]?.boys);
      const g = numOf(record[c]?.girls);
      perClass[c] = { boys: b, girls: g, total: b + g };
      boys += b;
      girls += g;
    });
    return { boys, girls, total: boys + girls, perClass };
  }, [record]);

  const sectionTotals = useCallback(
    (groups) => {
      let boys = 0,
        girls = 0;
      groups.flat().forEach((c) => {
        boys += numOf(record[c]?.boys);
        girls += numOf(record[c]?.girls);
      });
      return { boys, girls, total: boys + girls };
    },
    [record]
  );

  const juniorTotals = sectionTotals(JUNIOR);
  const seniorTotals = sectionTotals(SENIOR);

  const hasAnyEntry = ALL_CLASSES.some((c) => record[c]?.boys !== "" || record[c]?.girls !== "");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const saveRecord = async () => {
    setSaveState("saving");
    try {
      const payload = {};
      ALL_CLASSES.forEach((c) => {
        payload[c] = { boys: numOf(record[c]?.boys), girls: numOf(record[c]?.girls) };
      });
      payload._savedAt = new Date().toISOString();
      await setDoc(doc(db, COLLECTION_NAME, selectedDate), payload);
      setSaveState("saved");
      showToast("Attendance saved for " + formatDisplayDate(selectedDate));
      refreshDateList();
      setTimeout(() => setSaveState("idle"), 1800);
    } catch (e) {
      console.error("Save failed", e);
      setSaveState("error");
      showToast("Could not save. Check your internet connection and try again.");
      setTimeout(() => setSaveState("idle"), 2200);
    }
  };

  const clearForm = () => {
    setRecord(emptyRecord());
  };

  const openHistoryDate = async (dateISO) => {
    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, dateISO));
      if (snap.exists()) {
        setHistoryEntry({ date: dateISO, data: snap.data() });
      }
    } catch (e) {
      console.error("Failed to open history date", e);
      setHistoryEntry(null);
    }
  };

  const shiftDate = (delta) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setSelectedDate(toISODate(d));
  };

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <Header view={view} setView={setView} />

        {connectionError && (
          <div style={styles.errorBanner}>
            Having trouble reaching the server. Check your internet connection — your entries
            won't save until this is resolved.
          </div>
        )}

        {view === "entry" && (
          <>
            <DateBar
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              shiftDate={shiftDate}
              weekday={weekday}
              todayISO={todayISO}
              alreadySaved={recordedDates.includes(selectedDate)}
            />

            {!weekday && (
              <div style={styles.weekendNotice}>
                <span style={{ fontSize: 18, marginRight: 8 }}>&#9888;</span>
                {formatDisplayDate(selectedDate)} falls on a weekend. Attendance is taken Monday to
                Friday. You can still record a figure here if needed, but it won't count toward the
                school week automatically.
              </div>
            )}

            {loading ? (
              <div style={styles.loadingBox}>Loading register…</div>
            ) : (
              <>
                <SectionCard
                  title="Junior Secondary School"
                  groups={JUNIOR}
                  record={record}
                  updateCell={updateCell}
                  totals={totals.perClass}
                  sectionSummary={juniorTotals}
                />
                <SectionCard
                  title="Senior Secondary School"
                  groups={SENIOR}
                  record={record}
                  updateCell={updateCell}
                  totals={totals.perClass}
                  sectionSummary={seniorTotals}
                />

                <OverallTotal totals={totals} />

                <div style={styles.actionsRow}>
                  <button onClick={clearForm} style={styles.secondaryBtn} disabled={!hasAnyEntry}>
                    Clear entries
                  </button>
                  <button
                    onClick={saveRecord}
                    style={{ ...styles.primaryBtn, opacity: saveState === "saving" ? 0.7 : 1 }}
                    disabled={saveState === "saving"}
                  >
                    {saveState === "saving" ? "Saving…" : "Save attendance"}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {view === "history" && (
          <HistoryView
            recordedDates={recordedDates}
            openHistoryDate={openHistoryDate}
            historyEntry={historyEntry}
            goToEntry={(d) => {
              setSelectedDate(d);
              setView("entry");
            }}
          />
        )}
      </div>

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

function Header({ view, setView }) {
  return (
    <div style={styles.header}>
      <div style={styles.headerTop}>
        <img src={logoSrc} alt="Frontmark College logo" style={styles.logo} />
        <div>
          <div style={styles.eyebrow}>FRONTMARK COLLEGE</div>
          <h1 style={styles.title}>Daily Attendance Register</h1>
        </div>
      </div>
      <div style={styles.tabRow}>
        <button onClick={() => setView("entry")} style={view === "entry" ? styles.tabActive : styles.tab}>
          Take attendance
        </button>
        <button onClick={() => setView("history")} style={view === "history" ? styles.tabActive : styles.tab}>
          Previous records
        </button>
      </div>
    </div>
  );
}

function DateBar({ selectedDate, setSelectedDate, shiftDate, weekday, todayISO, alreadySaved }) {
  return (
    <div style={styles.dateBar}>
      <button onClick={() => shiftDate(-1)} style={styles.dateArrow} aria-label="Previous day">
        &#8592;
      </button>
      <div style={styles.dateCenter}>
        <div style={styles.dateBig}>{formatDisplayDate(selectedDate)}</div>
        <div style={styles.dateSubRow}>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={styles.dateInput}
          />
          {selectedDate !== todayISO && (
            <button onClick={() => setSelectedDate(todayISO)} style={styles.todayLink}>
              Jump to today
            </button>
          )}
          {alreadySaved && <span style={styles.savedPill}>Recorded</span>}
        </div>
      </div>
      <button onClick={() => shiftDate(1)} style={styles.dateArrow} aria-label="Next day">
        &#8594;
      </button>
    </div>
  );
}

function SectionCard({ title, groups, record, updateCell, totals, sectionSummary }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h2 style={styles.cardTitle}>{title}</h2>
        <div style={styles.cardHeaderTotals}>
          <TotalChip label="Boys" value={sectionSummary.boys} />
          <TotalChip label="Girls" value={sectionSummary.girls} />
          <TotalChip label="Total" value={sectionSummary.total} strong />
        </div>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, textAlign: "left", width: "34%" }}>Class</th>
              <th style={styles.th}>Boys</th>
              <th style={styles.th}>Girls</th>
              <th style={styles.th}>Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, gi) => (
              <React.Fragment key={gi}>
                {group.map((cls) => (
                  <tr key={cls} style={styles.tr}>
                    <td style={styles.tdLabel}>{cls}</td>
                    <td style={styles.tdInput}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={record[cls]?.boys ?? ""}
                        onChange={(e) => updateCell(cls, "boys", e.target.value)}
                        style={styles.cellInput}
                        placeholder="0"
                      />
                    </td>
                    <td style={styles.tdInput}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={record[cls]?.girls ?? ""}
                        onChange={(e) => updateCell(cls, "girls", e.target.value)}
                        style={styles.cellInput}
                        placeholder="0"
                      />
                    </td>
                    <td style={styles.tdTotal}>{totals[cls]?.total ?? 0}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TotalChip({ label, value, strong }) {
  return (
    <div style={strong ? styles.chipStrong : styles.chip}>
      <span style={{ opacity: 0.75 }}>{label}</span>
      <span style={{ fontWeight: 700, marginLeft: 6 }}>{value}</span>
    </div>
  );
}

function OverallTotal({ totals }) {
  return (
    <div style={styles.overallCard}>
      <div style={styles.overallLabel}>Whole school total</div>
      <div style={styles.overallRow}>
        <div style={styles.overallStat}>
          <div style={styles.overallNum}>{totals.boys}</div>
          <div style={styles.overallCaption}>Boys</div>
        </div>
        <div style={styles.overallDivider} />
        <div style={styles.overallStat}>
          <div style={styles.overallNum}>{totals.girls}</div>
          <div style={styles.overallCaption}>Girls</div>
        </div>
        <div style={styles.overallDivider} />
        <div style={styles.overallStat}>
          <div style={{ ...styles.overallNum, color: "#fff" }}>{totals.total}</div>
          <div style={styles.overallCaption}>Total present</div>
        </div>
      </div>
    </div>
  );
}

function HistoryView({ recordedDates, openHistoryDate, historyEntry, goToEntry }) {
  return (
    <div style={styles.historyLayout}>
      <div style={styles.historyList}>
        <div style={styles.historyListTitle}>Saved records ({recordedDates.length})</div>
        {recordedDates.length === 0 && (
          <div style={styles.emptyState}>
            No attendance has been saved yet. Once you save a day's register, it will appear here.
          </div>
        )}
        <div style={styles.historyScroll}>
          {recordedDates.map((d) => (
            <button
              key={d}
              onClick={() => openHistoryDate(d)}
              style={{
                ...styles.historyItem,
                ...(historyEntry && historyEntry.date === d ? styles.historyItemActive : {}),
              }}
            >
              <div style={{ fontWeight: 600 }}>{formatDisplayDate(d)}</div>
              <div style={{ fontSize: 12, opacity: 0.65 }}>{d}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={styles.historyDetail}>
        {!historyEntry ? (
          <div style={styles.emptyState}>Select a date on the left to view that day's attendance.</div>
        ) : (
          <HistoryDetail entry={historyEntry} goToEntry={goToEntry} />
        )}
      </div>
    </div>
  );
}

function HistoryDetail({ entry, goToEntry }) {
  const data = entry.data;
  const sumGroups = (groups) => {
    let boys = 0,
      girls = 0;
    groups.flat().forEach((c) => {
      boys += numOf(data[c]?.boys);
      girls += numOf(data[c]?.girls);
    });
    return { boys, girls, total: boys + girls };
  };
  const j = sumGroups(JUNIOR);
  const s = sumGroups(SENIOR);
  const overall = { boys: j.boys + s.boys, girls: j.girls + s.girls, total: j.total + s.total };

  return (
    <div>
      <div style={styles.historyDetailHeader}>
        <div>
          <div style={styles.eyebrow}>{entry.date}</div>
          <h2 style={styles.cardTitle}>{formatDisplayDate(entry.date)}</h2>
        </div>
        <button style={styles.secondaryBtn} onClick={() => goToEntry(entry.date)}>
          Edit this day
        </button>
      </div>

      <MiniSection title="Junior Secondary School" groups={JUNIOR} data={data} summary={j} />
      <MiniSection title="Senior Secondary School" groups={SENIOR} data={data} summary={s} />
      <OverallTotal totals={overall} />
    </div>
  );
}

function MiniSection({ title, groups, data, summary }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h3 style={styles.cardTitle}>{title}</h3>
        <div style={styles.cardHeaderTotals}>
          <TotalChip label="Boys" value={summary.boys} />
          <TotalChip label="Girls" value={summary.girls} />
          <TotalChip label="Total" value={summary.total} strong />
        </div>
      </div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, textAlign: "left", width: "34%" }}>Class</th>
              <th style={styles.th}>Boys</th>
              <th style={styles.th}>Girls</th>
              <th style={styles.th}>Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.flat().map((cls) => {
              const b = numOf(data[cls]?.boys);
              const g = numOf(data[cls]?.girls);
              return (
                <tr key={cls} style={styles.tr}>
                  <td style={styles.tdLabel}>{cls}</td>
                  <td style={styles.tdTotal}>{b}</td>
                  <td style={styles.tdTotal}>{g}</td>
                  <td style={styles.tdTotal}>{b + g}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const COLORS = {
  bg: "#F6F5F1",
  card: "#FFFFFF",
  ink: "#20261F",
  inkSoft: "#5B6459",
  line: "#E1E0D8",
  green: "#0F5D3E",
  greenSoft: "#E7EFE7",
  gold: "#7A3E8C",
  goldSoft: "#F1E7F4",
};

const styles = {
  page: {
    minHeight: "100vh",
    background: COLORS.bg,
    fontFamily: "'Inter', -apple-system, sans-serif",
    color: COLORS.ink,
    paddingBottom: 60,
  },
  wrap: { maxWidth: 900, margin: "0 auto", padding: "20px 16px 40px" },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: `2px solid ${COLORS.line}`,
  },
  headerTop: { display: "flex", alignItems: "center", gap: 14 },
  logo: { width: 52, height: 52, objectFit: "contain", flexShrink: 0 },
  eyebrow: { fontSize: 11, letterSpacing: "0.14em", fontWeight: 700, color: COLORS.gold, marginBottom: 2 },
  title: { fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: 0, color: COLORS.ink },
  tabRow: { display: "flex", gap: 8 },
  tab: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: 10,
    border: `1px solid ${COLORS.line}`,
    background: "#fff",
    color: COLORS.inkSoft,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  tabActive: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: 10,
    border: `1px solid ${COLORS.green}`,
    background: COLORS.green,
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  errorBanner: {
    background: "#FDEEEE",
    border: "1px solid #E9B8B8",
    color: "#8A2E2E",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 13.5,
    marginBottom: 16,
    lineHeight: 1.5,
  },
  dateBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: COLORS.card,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 14,
    padding: "12px 14px",
    marginBottom: 16,
  },
  dateArrow: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: `1px solid ${COLORS.line}`,
    background: "#fff",
    fontSize: 16,
    cursor: "pointer",
    color: COLORS.ink,
    flexShrink: 0,
  },
  dateCenter: { textAlign: "center", flex: 1 },
  dateBig: { fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600 },
  dateSubRow: { marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" },
  dateInput: { border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", color: COLORS.inkSoft },
  todayLink: { background: "none", border: "none", color: COLORS.green, fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline", padding: 0 },
  savedPill: { background: COLORS.greenSoft, color: COLORS.green, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.03em" },
  weekendNotice: { background: COLORS.goldSoft, border: `1px solid #D9BFE0`, color: "#5C2E68", borderRadius: 12, padding: "12px 14px", fontSize: 13.5, marginBottom: 16, lineHeight: 1.5 },
  loadingBox: { textAlign: "center", padding: 40, color: COLORS.inkSoft },
  card: { background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 16, marginBottom: 16, overflow: "hidden" },
  cardHeader: { display: "flex", flexDirection: "column", gap: 10, padding: "16px 16px 12px" },
  cardTitle: { fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, margin: 0, color: COLORS.ink },
  cardHeaderTotals: { display: "flex", gap: 8 },
  chip: { background: "#F2F1EC", borderRadius: 999, padding: "4px 10px", fontSize: 12.5, color: COLORS.ink },
  chipStrong: { background: COLORS.greenSoft, color: COLORS.green, borderRadius: 999, padding: "4px 10px", fontSize: 12.5 },
  tableWrap: { overflowX: "auto", borderTop: `1px solid ${COLORS.line}` },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "center", padding: "10px 8px", fontSize: 11.5, letterSpacing: "0.05em", color: COLORS.inkSoft, fontWeight: 700, textTransform: "uppercase", background: "#FAFAF7" },
  tr: { borderTop: `1px solid ${COLORS.line}` },
  tdLabel: { padding: "9px 12px", fontWeight: 600, color: COLORS.ink, fontSize: 13.5 },
  tdInput: { padding: "7px 6px", textAlign: "center" },
  tdTotal: { padding: "9px 6px", textAlign: "center", fontWeight: 700, color: COLORS.green },
  cellInput: { width: 56, textAlign: "center", padding: "7px 4px", borderRadius: 8, border: `1px solid ${COLORS.line}`, fontSize: 14, fontFamily: "inherit", color: COLORS.ink },
  overallCard: { background: COLORS.green, color: "#fff", borderRadius: 16, padding: "20px 16px", marginBottom: 20, textAlign: "center" },
  overallLabel: { fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.85, marginBottom: 12, fontWeight: 600 },
  overallRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 20 },
  overallStat: { display: "flex", flexDirection: "column", alignItems: "center" },
  overallNum: { fontFamily: "'Fraunces', serif", fontSize: 34, fontWeight: 700 },
  overallCaption: { fontSize: 12, opacity: 0.85, marginTop: 2 },
  overallDivider: { width: 1, height: 40, background: "rgba(255,255,255,0.3)" },
  actionsRow: { display: "flex", gap: 10, justifyContent: "flex-end" },
  secondaryBtn: { padding: "12px 18px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: "#fff", color: COLORS.inkSoft, fontWeight: 600, fontSize: 14, cursor: "pointer" },
  primaryBtn: { padding: "12px 22px", borderRadius: 10, border: "none", background: COLORS.green, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  historyLayout: { display: "flex", gap: 16, flexWrap: "wrap" },
  historyList: { flex: "1 1 260px", background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 14, maxHeight: 560 },
  historyListTitle: { fontWeight: 700, fontSize: 13.5, marginBottom: 10, color: COLORS.inkSoft },
  historyScroll: { maxHeight: 500, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 },
  historyItem: { textAlign: "left", padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: "#fff", cursor: "pointer", color: COLORS.ink },
  historyItemActive: { border: `1px solid ${COLORS.green}`, background: COLORS.greenSoft },
  historyDetail: { flex: "2 1 420px" },
  historyDetailHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 10, flexWrap: "wrap" },
  emptyState: { color: COLORS.inkSoft, fontSize: 13.5, padding: "24px 8px", lineHeight: 1.6 },
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: COLORS.ink,
    color: "#fff",
    padding: "12px 20px",
    borderRadius: 10,
    fontSize: 13.5,
    boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
    zIndex: 50,
    maxWidth: "90%",
    textAlign: "center",
  },
};
