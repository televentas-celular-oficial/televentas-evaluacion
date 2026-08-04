// Bottom nav de 4 tabs — SIEMPRE visible mientras scrollean
// Solo se muestra a rol vendedora. Admin y oficina tienen su propia navegación.

export default function BottomNav({ activo, onTab }) {
  const tabs = [
    { id: "hoy",     ico: "📊", lb: "Hoy" },
    { id: "ranking", ico: "📈", lb: "Ranking" },
    { id: "año",     ico: "💎", lb: "Mi año" },
    { id: "como",    ico: "❓", lb: "Cómo" },
  ];
  return (
    <div className="v-bottom-nav">
      {tabs.map(t => (
        <button
          key={t.id}
          className={"v-nav-tab" + (activo === t.id ? " active" : "")}
          onClick={() => onTab(t.id)}
        >
          <div className="ico">{t.ico}</div>
          <div className="lb">{t.lb}</div>
        </button>
      ))}
    </div>
  );
}
