'use client';

import { useEffect, useState } from 'react';
import styles from './news.module.css';

type NewsItem = {
  title: string;
  url: string;
  image?: string;
  source?: string;
};

export default function News() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        const res = await fetch('/api/news', { cache: 'no-store' });
        const data = await res.json();
        if (!alive) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (!alive) return;
        setItems([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    const t = setInterval(load, 1000 * 60 * 8); // 8 min
    return () => { alive = false; clearInterval(t); };
  }, []);

  const hero = items[0];
  const rest = items.slice(1, 9);

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <h1 className={styles.title}>News</h1>
        {/* removi o microtexto “manchetes...” que tava parecendo “dica pequena” */}
      </div>

      <div className={styles.grid}>
        <section className={styles.hero}>
          {loading && (
            <div className={styles.loading}>Carregando notícias...</div>
          )}

          {!loading && hero && (
            <a className={styles.heroLink} href={hero.url} target="_blank" rel="noreferrer">
              <div className={styles.heroMedia}>
                <img
                  src={hero.image || '/signage/placeholder-news.jpg'}
                  alt={hero.title}
                  className={styles.heroImg}
                  draggable={false}
                />
                <div className={styles.heroOverlay}>
                  <div className={styles.heroMeta}>
                    <span className={styles.badge}>{hero.source || 'News'}</span>
                  </div>
                  <div className={styles.heroTitle}>{hero.title}</div>
                </div>
              </div>
            </a>
          )}

          {!loading && !hero && (
            <div className={styles.loading}>Sem notícias por agora.</div>
          )}
        </section>

        <section className={styles.list}>
          {rest.map((n, idx) => (
            <a key={idx} className={styles.item} href={n.url} target="_blank" rel="noreferrer">
              <div className={styles.thumbWrap}>
                <img
                  src={n.image || '/signage/placeholder-news.jpg'}
                  alt={n.title}
                  className={styles.thumb}
                  draggable={false}
                />
                <span className={styles.badgeSmall}>{n.source || 'News'}</span>
              </div>
              <div className={styles.itemTitle}>{n.title}</div>
            </a>
          ))}
        </section>
      </div>
    </div>
  );
}
