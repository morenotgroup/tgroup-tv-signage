'use client';

import styles from './welcome.module.css';

export default function Welcome() {
  return (
    <div className={styles.wrap}>
      <div className={styles.headerLine}>
        <h1 className={styles.title}>Bem-vindas, vindes e vindos ao T.Group</h1>
        <div className={styles.subtitle}>Sede • Perdizes • Clima agora: 21°C</div>
      </div>

      {/* GRID PRINCIPAL — ocupa a TV inteira */}
      <div className={styles.grid}>
        {/* COLUNA ESQUERDA (stack) */}
        <section className={styles.stack}>
          <article className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.pill}>MISSÃO</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.bigText}>
                Criar experiências memoráveis em entretenimento, eventos e live marketing, com excelência na execução.
              </div>
              <div className={styles.smallText}>Do briefing ao aplauso — com execução impecável.</div>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.pill}>VISÃO</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.bigText}>
                Ser referência em entretenimento e live marketing com performance e tecnologia.
              </div>
              <div className={styles.smallText}>Performance real + tecnologia, sem perder o brilho.</div>
            </div>
          </article>
        </section>

        {/* COLUNA DIREITA (VALORES) */}
        <article className={`${styles.card} ${styles.values}`}>
          <div className={styles.cardTop}>
            <span className={styles.pill}>VALORES</span>

            {/* removi a “dica/manchete” pequena daqui; se quiser, volta depois */}
            <span className={styles.topTag}>
              entretenimento • live marketing • performance • tecnologia
            </span>
          </div>

          <div className={styles.cardBody}>
            <ul className={styles.valuesList}>
              <li><span className={styles.check}>✓</span> Respeito, diversidade e segurança</li>
              <li><span className={styles.check}>✓</span> Excelência com leveza</li>
              <li><span className={styles.check}>✓</span> Dono(a) do resultado</li>
              <li><span className={styles.check}>✓</span> Criatividade que vira entrega</li>
              <li><span className={styles.check}>✓</span> Transparência e colaboração</li>
            </ul>

            <div className={styles.footerNote}>
              Cultura aqui não é frase bonita — é operação.
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
