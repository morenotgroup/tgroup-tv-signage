'use client';

import styles from './agendaGC.module.css';

type Item = {
  date: string;   // 2026-02-24
  time: string;   // 20:00
  title: string;
  subtitle: string;
  tag?: string;
  icon: 'sports' | 'coffee' | 'cake' | 'beer';
};

const AGENDA: Item[] = [
  { date: '2026-02-24', time: '20:00', title: 'Esportes T.Group', subtitle: 'Vôlei de Areia • Playball', icon: 'sports' },
  { date: '2026-02-26', time: '17:00', title: 'Café com T', subtitle: 'Conexão + updates', tag: 'Sede', icon: 'coffee' },
  { date: '2026-02-26', time: '18:20', title: 'Parabéns do mês', subtitle: 'Aniversariantes de fevereiro', tag: 'Sede', icon: 'cake' },
  { date: '2026-02-26', time: '18:30', title: 'Happy Hour T.Group', subtitle: 'Fechamento do dia com a galera', tag: 'Sede', icon: 'beer' },
];

function fmtBR(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
  return { day: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`, wd };
}

function Icon({ kind }: { kind: Item['icon'] }) {
  const common = { className: styles.icon, 'aria-hidden': true } as any;

  if (kind === 'sports') return (
    <svg {...common} viewBox="0 0 24 24" fill="none">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2"/>
      <path d="M3.8 9.5c2.6.6 4.9.1 6.8-1.7M20.2 14.5c-2.6-.6-4.9-.1-6.8 1.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".9"/>
      <path d="M9.5 20.2c.6-2.6.1-4.9-1.7-6.8M14.5 3.8c-.6 2.6-.1 4.9 1.7 6.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".9"/>
    </svg>
  );

  if (kind === 'coffee') return (
    <svg {...common} viewBox="0 0 24 24" fill="none">
      <path d="M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" stroke="currentColor" strokeWidth="2"/>
      <path d="M16 10h2a3 3 0 1 1 0 6h-2" stroke="currentColor" strokeWidth="2"/>
      <path d="M6 4s1 1 .5 2S6 8 6 8M10 4s1 1 .5 2S10 8 10 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".9"/>
    </svg>
  );

  if (kind === 'cake') return (
    <svg {...common} viewBox="0 0 24 24" fill="none">
      <path d="M6 10h12v3a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4v-3Z" stroke="currentColor" strokeWidth="2"/>
      <path d="M5 17h14v4H5v-4Z" stroke="currentColor" strokeWidth="2"/>
      <path d="M9 6c0 1 1 1 1 2s-1 1-1 2M15 6c0 1 1 1 1 2s-1 1-1 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".9"/>
    </svg>
  );

  return (
    <svg {...common} viewBox="0 0 24 24" fill="none">
      <path d="M7 7h10v14H7V7Z" stroke="currentColor" strokeWidth="2"/>
      <path d="M9 3h6v4H9V3Z" stroke="currentColor" strokeWidth="2"/>
      <path d="M9 12h6M9 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export default function AgendaGC() {
  const next = AGENDA[0];
  const n = fmtBR(next.date);

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <h1 className={styles.title}>Agenda GC</h1>
      </div>

      <div className={styles.grid}>
        {/* MINI “PRÓXIMO” — menor e mais visual */}
        <section className={styles.next}>
          <div className={styles.nextHead}>
            <span className={styles.pill}>PRÓXIMO</span>
            <span className={styles.month}>fevereiro</span>
          </div>

          <div className={styles.nextBody}>
            <div className={styles.nextIcon}>
              <Icon kind={next.icon} />
            </div>
            <div className={styles.nextInfo}>
              <div className={styles.nextTitle}>{next.title}</div>
              <div className={styles.nextSub}>{next.subtitle}</div>
              <div className={styles.nextMeta}>
                <span className={styles.metaChip}>{n.day}</span>
                <span className={styles.metaChip}>{next.time}</span>
                <span className={styles.metaChip}>{n.wd}</span>
              </div>
            </div>
          </div>

          {/* mini “calendário” só como textura visual, sem poluir */}
          <div className={styles.calendarHint}>
            <div className={styles.calRow}>
              <span>SEG</span><span>TER</span><span>QUA</span><span>QUI</span><span>SEX</span><span>SÁB</span><span>DOM</span>
            </div>
            <div className={styles.calGrid}>
              {Array.from({ length: 28 }).map((_, i) => {
                const day = i + 1;
                const isHot = day === 24 || day === 26;
                return <div key={i} className={`${styles.calCell} ${isHot ? styles.hot : ''}`}>{day}</div>;
              })}
            </div>
          </div>
        </section>

        {/* LISTA DO MÊS */}
        <section className={styles.list}>
          <div className={styles.listHead}>
            <span className={styles.pill}>PROGRAMAÇÃO DO MÊS</span>
          </div>

          <div className={styles.items}>
            {AGENDA.map((it, idx) => {
              const f = fmtBR(it.date);
              return (
                <div key={idx} className={styles.item}>
                  <div className={styles.itemIcon}><Icon kind={it.icon} /></div>
                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>{it.title}</div>
                    <div className={styles.itemSub}>{it.subtitle}</div>
                    <div className={styles.itemMeta}>
                      <span className={styles.metaChip}>{f.wd}</span>
                      <span className={styles.metaChip}>{f.day}</span>
                      <span className={styles.metaChip}>{it.time}</span>
                      {it.tag ? <span className={styles.metaChip}>{it.tag}</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
