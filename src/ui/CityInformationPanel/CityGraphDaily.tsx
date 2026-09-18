import { ArrowLeft, Archive, MapPin, Newspaper, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { Locale, TranslationKey } from "../../i18n";
import { newsCategories, type NewsArticle, type NewsCategory } from "../../model/AI";
import type { City } from "../../model/City";

interface Props {
  city: City;
  locale: Locale;
  generating: boolean;
  onGenerate: () => void;
  onLocate: (article: NewsArticle) => void;
  t: (key: TranslationKey) => string;
}

export function CityGraphDaily({ city, locale, generating, onGenerate, onLocate, t }: Props) {
  const [category, setCategory] = useState<"all" | NewsCategory>("all"); const [archive, setArchive] = useState(false); const [selectedId, setSelectedId] = useState<string>();
  const issues = [...(city.dailyNewsIssues ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const visibleIssues = archive ? issues : issues.slice(0, 1); const articleIds = new Set(visibleIssues.flatMap((issue) => issue.articleIds));
  const articles = useMemo(() => [...(city.newsArticles ?? [])].filter((article) => articleIds.has(article.id) && (category === "all" || article.category === category)).sort((a, b) => b.importance - a.importance || b.date.localeCompare(a.date)), [city.newsArticles, visibleIssues.map((issue) => issue.id).join("|"), category]);
  const selected = articles.find((article) => article.id === selectedId);
  if (selected) return <div className="daily-reader"><button className="daily-back" type="button" onClick={() => setSelectedId(undefined)}><ArrowLeft size={15}/>{t("daily.back")}</button><span>{t(`daily.category.${selected.category}` as TranslationKey)}</span><h2>{selected.headline}</h2><time>{new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(`${selected.date}T00:00:00`))}</time><p className="daily-lead">{selected.summary}</p><div className="daily-body">{selected.body}</div><button className="daily-map-button" type="button" disabled={!selected.relatedEntityIds.some((id) => id)} onClick={() => onLocate(selected)}><MapPin size={15}/>{t("daily.viewMap")}</button></div>;
  const headline = articles[0];
  return <div className="citygraph-daily">
    <header className="daily-masthead"><div><small>CITYGRAPH DAILY</small><h2>{city.name}</h2><time>{issues[0]?.date ?? new Date().toISOString().slice(0, 10)}</time></div><Newspaper size={28}/></header>
    <div className="daily-toolbar"><button type="button" disabled={generating} onClick={onGenerate}><RefreshCw size={14}/>{t(generating ? "daily.generating" : "daily.generate")}</button><button type="button" className={archive ? "is-active" : ""} onClick={() => setArchive((value) => !value)}><Archive size={14}/>{t("daily.archive")}</button></div>
    <div className="daily-categories"><button type="button" className={category === "all" ? "is-active" : ""} onClick={() => setCategory("all")}>{t("daily.category.all")}</button>{newsCategories.map((item) => <button key={item} type="button" className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>{t(`daily.category.${item}` as TranslationKey)}</button>)}</div>
    {!headline ? <div className="daily-empty"><Newspaper size={30}/><p>{t("daily.empty")}</p><small>{t("daily.emptyHint")}</small></div> : <><button className="daily-headline" type="button" onClick={() => setSelectedId(headline.id)}><small>{t("daily.topStory")} · {t(`daily.category.${headline.category}` as TranslationKey)}</small><strong>{headline.headline}</strong><p>{headline.summary}</p><time>{headline.date}</time></button><div className="daily-list">{articles.slice(1).map((article) => <button key={article.id} type="button" onClick={() => setSelectedId(article.id)}><small>{t(`daily.category.${article.category}` as TranslationKey)}</small><strong>{article.headline}</strong><p>{article.summary}</p><time>{article.date}</time></button>)}</div></>}
  </div>;
}
