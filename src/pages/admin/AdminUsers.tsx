import { useEffect, useMemo, useState } from "react";
import { listPeople, personName, type PersonRow } from "../../lib/adminData";
import { dateLocale, useLanguage, useT } from "../../lib/i18n";
import { Feedback, errorText } from "./shared";

type RoleFilter = "all" | PersonRow["role"];

export default function AdminUsers() {
  const language = useLanguage();
  const locale = dateLocale[language];
  const t = useT({
    fr: { title: "Utilisateurs", intro: "Tous les comptes de la plateforme. Les rôles se modifient par les circuits prévus (invitation enseignant, approbation de candidature).", loading: "Chargement des comptes…", empty: "Aucun compte ne correspond à votre recherche.", search: "Rechercher un nom ou un e-mail", role: "Rôle", all: "Tous", student: "Élève", teacher: "Enseignant", admin: "Administrateur", joined: "Inscrit le", total: "comptes", shown: "affichés" },
    en: { title: "Users", intro: "All accounts on the platform. Roles are changed through the intended routes (teacher invitation, application approval).", loading: "Loading accounts…", empty: "No account matches your search.", search: "Search a name or email", role: "Role", all: "All", student: "Student", teacher: "Teacher", admin: "Administrator", joined: "Joined", total: "accounts", shown: "shown" },
    pt: { title: "Utilizadores", intro: "Todas as contas da plataforma. As funções alteram-se pelos circuitos previstos (convite de professor, aprovação de candidatura).", loading: "A carregar as contas…", empty: "Nenhuma conta corresponde à pesquisa.", search: "Pesquisar um nome ou e-mail", role: "Função", all: "Todos", student: "Aluno", teacher: "Professor", admin: "Administrador", joined: "Inscrito em", total: "contas", shown: "apresentadas" },
    es: { title: "Usuarios", intro: "Todas las cuentas de la plataforma. Los roles se cambian por los circuitos previstos (invitación de profesor, aprobación de solicitud).", loading: "Cargando las cuentas…", empty: "Ninguna cuenta coincide con la búsqueda.", search: "Buscar un nombre o correo", role: "Rol", all: "Todos", student: "Alumno", teacher: "Profesor", admin: "Administrador", joined: "Registrado el", total: "cuentas", shown: "mostradas" },
  });
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");

  useEffect(() => {
    let active = true;
    listPeople().then((rows) => { if (active) setPeople(rows); }).catch((cause) => { if (active) { setError(errorText(cause)); setPeople([]); } });
    return () => { active = false; };
  }, []);

  const roleLabel: Record<PersonRow["role"], string> = { student: t.student, teacher: t.teacher, admin: t.admin };
  const counts = useMemo(() => {
    const result = { all: people?.length ?? 0, student: 0, teacher: 0, admin: 0 };
    for (const person of people ?? []) result[person.role] += 1;
    return result;
  }, [people]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (people ?? []).filter((person) =>
      (role === "all" || person.role === role) &&
      (!needle || personName(person).toLowerCase().includes(needle) || (person.email ?? "").toLowerCase().includes(needle)));
  }, [people, query, role]);

  return (
    <div>
      <h2>{t.title}</h2>
      <p className="muted">{t.intro}</p>
      <Feedback error={error} />
      {people === null && <p className="muted" role="status">{t.loading}</p>}
      {people !== null && (
        <>
          <div className="row" role="group" aria-label={t.role}>
            {(["all", "student", "teacher", "admin"] as const).map((value) => (
              <button key={value} type="button" className={role === value ? "btn small primary" : "btn small"} aria-pressed={role === value} onClick={() => setRole(value)}>
                {value === "all" ? t.all : roleLabel[value]} ({counts[value]})
              </button>
            ))}
          </div>
          <label>
            <span className="muted small-text">{t.search}</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
          </label>
          <p className="muted small-text" role="status">{visible.length} {t.shown} · {counts.all} {t.total}</p>
          {visible.length === 0 && !error && <p className="notice">{t.empty}</p>}
          <ul className="stack">
            {visible.map((person) => (
              <li key={person.id} className="panel">
                <div className="row between">
                  <span><strong>{personName(person)}</strong><br /><span className="muted small-text">{person.email}{person.created_at && <> · {t.joined} {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(person.created_at))}</>}</span></span>
                  <span className={`pill ${person.role === "admin" ? "ongoing" : person.role === "teacher" ? "" : "past"}`}>{roleLabel[person.role]}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
