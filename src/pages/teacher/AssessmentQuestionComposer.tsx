import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { errorText } from "../admin/shared";

type Question = { id: string; prompt: string; question_type: "multiple_choice" | "written"; points: number; position: number };
type Option = { id: string; question_id: string; label: string; position: number };
type Key = { question_id: string; correct_option_ids: string[]; expected_text: string | null; explanation: string | null };

export default function AssessmentQuestionComposer({ assessmentId, allowMultipleChoice, allowWritten }: {
  assessmentId: string; allowMultipleChoice: boolean; allowWritten: boolean;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [keys, setKeys] = useState<Record<string, Key>>({});
  const [type, setType] = useState<"multiple_choice" | "written">(allowMultipleChoice ? "multiple_choice" : "written");
  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState("1");
  const [choices, setChoices] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState<number[]>([]);
  const [expected, setExpected] = useState("");
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const q = await supabase.from("assessment_questions").select("id,prompt,question_type,points,position").eq("assessment_id", assessmentId).order("position");
    if (q.error) throw q.error;
    const rows = (q.data ?? []) as Question[];
    setQuestions(rows);
    const ids = rows.map((item) => item.id);
    if (!ids.length) { setOptions([]); setKeys({}); return; }
    const [o, k] = await Promise.all([
      supabase.from("assessment_options").select("id,question_id,label,position").in("question_id", ids).order("position"),
      supabase.from("assessment_answer_keys").select("question_id,correct_option_ids,expected_text,explanation").in("question_id", ids),
    ]);
    if (o.error) throw o.error;
    if (k.error) throw k.error;
    setOptions((o.data ?? []) as Option[]);
    setKeys(Object.fromEntries(((k.data ?? []) as Key[]).map((item) => [item.question_id, item])));
  }

  useEffect(() => { void load().catch((cause) => setError(errorText(cause))); }, [assessmentId]);

  async function addQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    const score = Number(points.replace(",", "."));
    if (!cleanPrompt || !Number.isFinite(score) || score <= 0) { setError("Saisissez une question et un nombre de points positif."); return; }
    const cleanChoices = choices.map((value) => value.trim());
    if (type === "multiple_choice" && (cleanChoices.length < 2 || cleanChoices.some((value) => !value) || correct.length === 0)) {
      setError("Ajoutez au moins deux propositions et sélectionnez au moins une bonne réponse."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const position = questions.reduce((max, item) => Math.max(max, item.position), -1) + 1;
      const created = await supabase.from("assessment_questions").insert({
        assessment_id: assessmentId, prompt: cleanPrompt, question_type: type, points: score, position,
      }).select("id").single();
      if (created.error) throw created.error;
      const questionId = created.data.id as string;
      if (type === "multiple_choice") {
        const inserted = await supabase.from("assessment_options").insert(cleanChoices.map((label, index) => ({
          question_id: questionId, label, position: index,
        }))).select("id");
        if (inserted.error) throw inserted.error;
        const correctIds = correct.map((index) => inserted.data[index]?.id).filter(Boolean);
        const key = await supabase.from("assessment_answer_keys").insert({
          question_id: questionId, correct_option_ids: correctIds, explanation: explanation.trim() || null,
        });
        if (key.error) throw key.error;
      } else {
        const key = await supabase.from("assessment_answer_keys").insert({
          question_id: questionId, expected_text: expected.trim() || null, explanation: explanation.trim() || null,
        });
        if (key.error) throw key.error;
      }
      setPrompt(""); setPoints("1"); setChoices(["", "", "", ""]); setCorrect([]); setExpected(""); setExplanation("");
      await load(); setNotice("Question ajoutée.");
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  async function removeQuestion(question: Question) {
    if (!window.confirm("Supprimer cette question et ses propositions ?")) return;
    setBusy(true); setError("");
    const result = await supabase.from("assessment_questions").delete().eq("id", question.id);
    if (result.error) setError(errorText(result.error));
    else await load().catch((cause) => setError(errorText(cause)));
    setBusy(false);
  }

  return (
    <section className="panel form" aria-label="Composition des questions">
      <h3>Questions et corrigés</h3>
      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {questions.map((question, index) => {
        const questionOptions = options.filter((option) => option.question_id === question.id);
        const key = keys[question.id];
        return (
          <article className="panel" key={question.id}>
            <div className="row between"><strong>{index + 1}. {question.prompt}</strong><span className="tag">{question.points} pt · {question.question_type === "written" ? "Réponse écrite" : "Choix multiples"}</span></div>
            {questionOptions.map((option) => <p key={option.id} className="small-text">{option.label}{key?.correct_option_ids.includes(option.id) ? " ✓" : ""}</p>)}
            {key?.expected_text && <p className="small-text"><strong>Réponse attendue :</strong> {key.expected_text}</p>}
            {key?.explanation && <p className="muted small-text"><strong>Explication :</strong> {key.explanation}</p>}
            <button className="btn small danger" type="button" disabled={busy} onClick={() => void removeQuestion(question)}>Supprimer</button>
          </article>
        );
      })}
      <form onSubmit={addQuestion}>
        <h4>Ajouter une question</h4>
        <label>Type de question
          <select value={type} onChange={(event) => setType(event.target.value as "multiple_choice" | "written")}>
            {allowMultipleChoice && <option value="multiple_choice">Choix multiples</option>}
            {allowWritten && <option value="written">Réponse écrite</option>}
          </select>
        </label>
        <label>Énoncé<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} required /></label>
        <label>Points<input value={points} onChange={(event) => setPoints(event.target.value)} inputMode="decimal" required /></label>
        {type === "multiple_choice" && allowMultipleChoice && (
          <fieldset>
            <legend>Propositions — cochez toutes les bonnes réponses</legend>
            {choices.map((choice, index) => (
              <div className="inline-form" key={index}>
                <input aria-label={`Proposition ${index + 1}`} value={choice} onChange={(event) => setChoices((old) => old.map((item, i) => i === index ? event.target.value : item))} />
                <label className="check"><input type="checkbox" checked={correct.includes(index)} onChange={(event) => setCorrect((old) => event.target.checked ? [...old, index] : old.filter((item) => item !== index))} /> Bonne réponse</label>
                {choices.length > 2 && <button className="btn small" type="button" onClick={() => { setChoices((old) => old.filter((_, i) => i !== index)); setCorrect((old) => old.filter((i) => i !== index).map((i) => i > index ? i - 1 : i)); }}>Retirer</button>}
              </div>
            ))}
            <button className="btn small" type="button" onClick={() => setChoices((old) => [...old, ""])}>Ajouter une proposition</button>
          </fieldset>
        )}
        {type === "written" && allowWritten && <label>Réponse attendue / éléments de correction<textarea rows={3} value={expected} onChange={(event) => setExpected(event.target.value)} /></label>}
        <label>Explication du corrigé<textarea rows={3} value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Explication visible par l'élève après publication des résultats" /></label>
        <button className="btn primary" type="submit" disabled={busy || (type === "multiple_choice" && !allowMultipleChoice) || (type === "written" && !allowWritten)}>{busy ? "Enregistrement…" : "Ajouter la question"}</button>
      </form>
    </section>
  );
}
