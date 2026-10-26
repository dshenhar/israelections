import { html } from 'htm/preact';
import { QUESTIONS, STAGES, maxPoints, LONE_WOLF_MIN_VOTERS, POLL_SOURCE, BLOCS, PARTY } from '/shared/game.js';
import { formatWhen } from '../lib.js';
import { useApp } from '../ui.js';

export function Rules() {
  const { state } = useApp();
  const s = state.settings;
  const points = (q) =>
    q.type === 'threshold'
      ? `${q.pointsEach} × ${q.parties.length}`
      : q.type === 'seats'
        ? `עד ${maxPoints(q, state.results)}`
        : q.type === 'coalition'
          ? `${q.pointsEach} למפלגה`
          : q.points;

  return html`
    <section class="hero">
      <h1>📖 איך זה עובד</h1>
      <p class="sub">שני שלבים, 100 נקודות בכל אחד. מי שצובר הכי הרבה — לוקח.</p>
    </section>

    <section class="card rules">
      <h3>שלושה סוגי שאלות</h3>
      <ul>
        <li><b>👆 בחירה אחת</b> — צדקת? מקבלים את כל הנקודות של השאלה.</li>
        <li><b>📊 טווח</b> — בוחרים ״סל״ (למשל 70%–72%). התוצאה בתוך הסל? מקבלים.</li>
        <li><b>🔢 מנדטים</b> — פגיעה מדויקת = 2 נק׳, פספוס במנדט אחד = נק׳ אחת.</li>
      </ul>
      <h3>🐺 בונוס זאב בודד</h3>
      <p>צדקת בשאלת בחירה או טווח כשפחות מ-20% מהמשרד בחרו כמוך? מקבלים 50% נקודות בונוס (כשענו לפחות ${LONE_WOLF_MIN_VOTERS} אנשים).</p>
      <h3>⏰ נעילה</h3>
      <p>אפשר לשנות תשובות עד הנעילה. אחרי הנעילה ההימורים של כולם נחשפים בלשונית ״המשרד״.</p>
      <ul>
        <li>שלב א׳ ננעל ${formatWhen(s.stage1Lock)} — עם סגירת הקלפיות.</li>
        <li>שאלת אחוז ההצבעה ננעלת ${formatWhen(s.turnoutLock)} — לפני דיווח ההצבעה הראשון.</li>
        <li>שלב ב׳ נפתח אחרי התוצאות הסופיות וננעל לפני ההתייעצויות אצל הנשיא.</li>
      </ul>
      <h3>🏟️ ליגות</h3>
      <p>כל מקום עבודה מתחרה בליגה משלו, עם טבלה, צוותים ועדכונים משלה. ההימורים שלך אישיים: אם את/ה ביותר מליגה אחת, אותם הימורים נספרים בכל אחת מהן. בונוס הזאב הבודד וחכמת ההמונים מחושבים מול חברי הליגה.</p>
      <h3>🏆 מנצחים</h3>
      <p>בליל הבחירות הטבלה מתעדכנת בשידור חי לפי המדגמים והספירה. המנצח/ת בשלב א׳ מוכתר/ת לפי התוצאות הסופיות. בשוויון — מכריע מספר הפגיעות המדויקות במנדטים. יש גם טבלה כללית (שני השלבים) וליגת צוותים לפי ממוצע.</p>
      <h3>📏 הגדרות</h3>
      <ul>
        <li><b>ממוצע הסקרים</b> — ${POLL_SOURCE}. מפלגה מתחת לסף נספרת כ-0.</li>
        <li><b>${BLOCS.right.name}</b> — ${BLOCS.right.parties.map((p) => PARTY[p].name).join(', ')}.</li>
        <li><b>${BLOCS.change.name}</b> — ${BLOCS.change.parties.map((p) => PARTY[p].name).join(', ')}.</li>
        <li><b>הפתעה / אכזבה</b> — ההפרש במנדטים בין התוצאה לממוצע הסקרים. בשוויון — כל המפלגות שבשוויון נחשבות נכונות.</li>
      </ul>
    </section>

    ${[1, 2].map(
      (stage) => html`<section class="card rules">
        <h3>${STAGES[stage].emoji} ${STAGES[stage].name}: ${STAGES[stage].title}</h3>
        <table>
          <tbody>
            ${QUESTIONS.filter((q) => q.stage === stage).map(
              (q) => html`<tr><td>${q.emoji} ${q.title}</td><td>${points(q)}</td></tr>`,
            )}
          </tbody>
        </table>
      </section>`,
    )}
  `;
}
