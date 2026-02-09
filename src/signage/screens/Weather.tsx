'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './weather.module.css';

type WeatherData = {
  location: string;
  temp: number;
  condition: string;
  icon: 'rain' | 'cloud' | 'sun' | 'storm' | 'fog';
  hourly: Array<{ time: string; temp: number; pop: number; icon: WeatherData['icon'] }>;
  daily: Array<{ day: string; min: number; max: number; icon: WeatherData['icon'] }>;
  wind: number;
  humidity: number;
  uv: number;
  popNow: number;
  sunset: string;
};

function Icon({ kind }: { kind: WeatherData['icon'] }) {
  const common = { className: styles.wxIcon, 'aria-hidden': true } as any;

  if (kind === 'rain') return (
    <svg {...common} viewBox="0 0 24 24" fill="none">
      <path d="M7 16a5 5 0 1 1 .7-9.95A6 6 0 0 1 20 10a4 4 0 0 1-1 7H7Z" stroke="currentColor" strokeWidth="2" opacity=".9"/>
      <path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
  if (kind === 'storm') return (
    <svg {...common} viewBox="0 0 24 24" fill="none">
      <path d="M7 15a5 5 0 1 1 .7-9.95A6 6 0 0 1 20 9a4 4 0 0 1-1 6H7Z" stroke="currentColor" strokeWidth="2" opacity=".9"/>
      <path d="M13 14l-2 4h3l-2 4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  );
  if (kind === 'fog') return (
    <svg {...common} viewBox="0 0 24 24" fill="none">
      <path d="M7 12a5 5 0 1 1 .7-9.95A6 6 0 0 1 20 6a4 4 0 0 1-1 6H7Z" stroke="currentColor" strokeWidth="2" opacity=".9"/>
      <path d="M4 17h16M6 20h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".9"/>
    </svg>
  );
  if (kind === 'sun') return (
    <svg {...common} viewBox="0 0 24 24" fill="none">
      <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
  return (
    <svg {...common} viewBox="0 0 24 24" fill="none">
      <path d="M7 16a5 5 0 1 1 .7-9.95A6 6 0 0 1 20 10a4 4 0 0 1-1 6H7Z" stroke="currentColor" strokeWidth="2" opacity=".9"/>
    </svg>
  );
}

export default function Weather() {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        const res = await fetch('/api/weather', { cache: 'no-store' });
        const json = await res.json();
        if (!alive) return;
        setData(json);
      } catch {
        if (!alive) return;
        setData(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    const t = setInterval(load, 1000 * 60 * 10);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const alerts = useMemo(() => {
    if (!data) return [];
    const maxPop = Math.max(...data.hourly.slice(0, 10).map(h => h.pop));
    const maxUv = data.uv;
    const wind = data.wind;

    const a: string[] = [];
    if (maxPop > 60) a.push('chuva provável');
    if (maxUv > 7) a.push('UV alto — evitar sol');
    if (wind > 25) a.push('vento forte — atenção entrada');

    return a;
  }, [data]);

  const resumo = useMemo(() => {
    if (!data) return '';
    return `Hoje: ${data.temp}°C • Chuva ${data.popNow}% • Vento ${data.wind}km/h • Pôr do sol ${data.sunset}`;
  }, [data]);

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <h1 className={styles.title}>Clima</h1>
      </div>

      {loading && <div className={styles.loading}>Carregando previsão...</div>}

      {!loading && !data && <div className={styles.loading}>Sem dados de clima agora.</div>}

      {!loading && data && (
        <div className={styles.layout}>
          {/* BLOCO “AGORA” */}
          <section className={styles.now}>
            <div className={styles.nowMain}>
              <div className={styles.nowIcon}>
                <Icon kind={data.icon} />
              </div>
              <div className={styles.nowTemp}>{data.temp}°C</div>
              <div className={styles.nowMeta}>
                <div className={styles.location}>{data.location}</div>
                <div className={styles.cond}>{data.condition}</div>
              </div>
            </div>

            <div className={styles.metrics}>
              <div className={styles.metric}><span>Chuva</span><b>{data.popNow}%</b></div>
              <div className={styles.metric}><span>Vento</span><b>{data.wind}km/h</b></div>
              <div className={styles.metric}><span>Umidade</span><b>{data.humidity}%</b></div>
              <div className={styles.metric}><span>UV</span><b>{data.uv}</b></div>
            </div>
          </section>

          {/* PRÓXIMOS DIAS */}
          <section className={styles.days}>
            <div className={styles.sectionTitle}>Próximos dias</div>
            <div className={styles.daysRow}>
              {data.daily.slice(0, 5).map((d, i) => (
                <div key={i} className={styles.dayCard}>
                  <div className={styles.dayName}>{d.day}</div>
                  <Icon kind={d.icon} />
                  <div className={styles.dayTemp}>{d.max}° <span>{d.min}°</span></div>
                </div>
              ))}
            </div>
          </section>

          {/* HOJE (PRÓXIMAS HORAS) — “descendo” */}
          <section className={styles.hourly}>
            <div className={styles.sectionTitle}>Hoje (próximas horas)</div>
            <div className={styles.hourRow}>
              {data.hourly.slice(0, 9).map((h, i) => (
                <div key={i} className={styles.hourCard}>
                  <div className={styles.hourTime}>{h.time}</div>
                  <Icon kind={h.icon} />
                  <div className={styles.hourTemp}>{h.temp}°</div>
                  <div className={styles.hourPop}>Chuva {h.pop}%</div>
                </div>
              ))}
            </div>
          </section>

          {/* ALERTAS + RESUMO (bonito e grande) */}
          <section className={styles.bottom}>
            <div className={styles.alerts}>
              <div className={styles.sectionTitle}>Alertas do dia</div>
              <div className={styles.alertChips}>
                {alerts.length === 0 ? (
                  <div className={styles.chip}>sem alertas relevantes</div>
                ) : (
                  alerts.map((a, i) => <div key={i} className={styles.chip}>{a}</div>)
                )}
              </div>
            </div>

            <div className={styles.resumo}>
              <div className={styles.sectionTitle}>Resumo operacional</div>
              <div className={styles.resumoLine}>{resumo}</div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
