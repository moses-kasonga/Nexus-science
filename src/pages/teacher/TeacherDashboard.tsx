import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { displayName, useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { Feedback, dayLabel, errorText } from "../admin/shared";

type Schedule = { start_date: string; end_date: string; status: string };
type MyCourse = { id: string; name: string; category: string; published: boolean; course_schedules: Schedule[] };

export default function TeacherDashboard() {
  const { session, profile, loading } = useAuth();
  const [courses, setCourses] = useState<MyCourse[] | null>(null);
  const [error, setError] = useState("");
  const userId = session?.user.id;
  const isTeacher = profile?.role === "teacher";

  useEffect(() => {
    if (!userId || !isTeacher) return;
    let active = true;
    (async () => {
      const { data: links, error: linkError } = await supabase.from("course_teachers").select("course_id").eq("teacher_id", userId);
      if (linkError) throw linkError;
      const ids = (links ?? []).map((row) => row.course_id as string);
      if (ids.length === 0) return [] as MyCourse[];
      const { data, error: courseError } = await supabase.from("courses")
        .select("id, name, category, published, course_schedules(start_date, end_date, status)").in("id", ids).order("name");
      if (courseError) throw courseError;
      return (data ?? []) as MyCourse[];
    })().then((value) => { if (active) setCourses(value); })
      .catch((cause) => { if (active) { setError(errorText(cause)); setCourses([]); } });
    return () => { active = false; };
  }, [userId, isTeacher]);

  if (loading) return <section className="wrap page"><p className="muted" role="status">Chargement…</p></section>;
  if (!session) return <Navigate to="/connexion?retour=%2Fenseignant" replace />;
  if (!isTeacher) return <section className="wrap page narrow"><h1>Espace enseignant</h1><p className="notice">Cet espace est réservé aux enseignants approuvés par l'administration.</p><p><Link to="/">Retour à l'accueil</Link></p></section>;

  return (
    <section className="wrap page">
      <p className="eyebrow">Espace enseignant</p>
      <h1>Bonjour {displayName(profile, session.user.email)}</h1>
      <p className="muted">Vos formations : gérez les leçons et suivez les élèves inscrits. L'évaluation sera ajoutée prochainement.</p>
      <Feedback error={error} />
      {courses === null && <p className="muted" role="status">Chargement de vos formations…</p>}
      {courses?.length === 0 && !error && <p className="notice">Aucune formation ne vous est encore attribuée. L'administration peut vous en affecter dans Administration, puis Formations.</p>}
      <ul className="stack">
        {courses?.map((course) => (
          <li key={course.id} className="panel row between">
            <span>
              <strong>{course.name}</strong> <span className="tag">{course.category}</span> {!course.published && <span className="pill past">Non publiée</span>}<br />
              <span className="muted small-text">{course.course_schedules.length === 0 ? "Aucune session" : course.course_schedules.slice().sort((a, b) => a.start_date.localeCompare(b.start_date)).map((item) => `${dayLabel(item.start_date)} → ${dayLabel(item.end_date)}`).join(" · ")}</span>
            </span>
            <Link className="btn primary small" to={`/enseignant/cours/${course.id}`}>Ouvrir</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
