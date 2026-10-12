import { q } from "@/lib/db";
import { ensureSources, type Source } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const metadata = { title: "How it works · Funding Pulse" };

export default async function About() {
  await ensureSources();
  const sources = await q<Source>("select * from sources where active order by id");
  return (
    <main className="about">
      <p className="kicker">About</p>
      <h1>A brief you can check, not just read.</h1>
      <p className="deck">
        Funding Pulse is a Monday-morning digest of Indian startup funding for a venture scout. It exists because skimming two or three
        publications catches about 60% of deals, a deal spreadsheet runs weeks behind, and the deal that mattered, a company next
        to a portfolio company, was found in a board meeting.
      </p>

      <h2>How a brief is made</h2>
      <ol>
        <li><b>Ingest.</b> Fetch every feed and keep the last 7 days of articles that look like funding news.</li>
        <li><b>Extract.</b> Gemini Flash reads them and returns deal fields as strict JSON.</li>
        <li><b>Verify, convert, merge.</b> Plain code checks each amount against the article, converts currency, and merges the same deal reported by several outlets.</li>
        <li><b>Relevance and adjacency.</b> Code marks your focus deals and watchlist hits. Gemini flags deals next to a portfolio company.</li>
        <li><b>Patterns.</b> Code counts. Gemini describes the counts. Code checks the description.</li>
        <li><b>Send.</b> The brief is saved, shown here, and emailed.</li>
      </ol>

      <h2>The Cut: numbers never come from the AI</h2>
      <ul>
        <li>An amount is shown only if Gemini’s quoted text appears word for word in the article. Otherwise the deal says <b>undisclosed</b>.</li>
        <li>Crore, lakh, million, billion, ₹ and $ are converted by code, not by Gemini.</li>
        <li>Every count, total and week-on-week change is computed in code. Gemini only turns those numbers into sentences, and code rejects any sentence containing a number that isn’t in the counts. A plain template replaces it.</li>
      </ul>

      <h2>The human gate: it reports, you decide</h2>
      <p>The brief never recommends which founders to contact or what to tell LPs. Deals that don’t match your focus are never hidden: they sit under “Rest of the week”. Adjacency flags are labelled as an AI judgement, with a link to check the source.</p>

      <h2>Where the news comes from</h2>
      <ul>
        {sources.map((s) => <li key={s.id}>{s.name}</li>)}
      </ul>
      <p>Every deal links back to the articles it came from, so any figure can be verified in one click. Sources are listed in a database table and can be extended without a deploy. Each brief ends with how many articles each source returned, and a source that returns nothing is flagged in red.</p>

      <h2>What it doesn’t cover</h2>
      <ul>
        <li><b>LinkedIn and Twitter/X are out of scope.</b> They can’t be scraped legally and have no open API.</li>
        <li>Most RSS feeds only hold their latest 20 to 50 items, so the history reaches back about a week. Week-on-week trends need a few weeks of runs to appear.</li>
        <li>Google News results give a headline, not the full article, so some amounts and details can’t be verified and appear as “undisclosed”.</li>
        <li>It reads announcements. It can miss a deal that no covered outlet reported.</li>
      </ul>
    </main>
  );
}
