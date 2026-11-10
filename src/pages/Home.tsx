import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPublishedCourses, formatRange, sessionState, sessionStateLabel, type Course, type Language } from "../lib/courses";
import { useAuth } from "../lib/auth";

const copy = {
  fr: {
    eyebrow:"NEXUS SCIENCE", title:"Un environnement d’apprentissage scientifique structuré, accessible et conçu pour accompagner votre progression.",
    tagline:"Apprendre les sciences avec méthode et exigence.", intro:"NEXUS SCIENCE rassemble cours, leçons, exercices et évaluations dans une plateforme pensée pour accompagner chaque étudiant dans son parcours scientifique.",
    discover:"Découvrir NEXUS SCIENCE", featuresTitle:"Un espace pour apprendre, comprendre et progresser", featuresIntro:"Explorez les disciplines scientifiques, consultez les cours et suivez votre évolution dans un espace étudiant personnalisé.",
    courses:"Cours & leçons", coursesText:"Des contenus organisés par matière pour construire progressivement vos connaissances.", practice:"Exercices & quiz", practiceText:"Des évaluations pour vérifier vos acquis et identifier les notions à retravailler.", progress:"Suivi de progression", progressText:"Un espace personnel pour retrouver votre parcours et vos résultats.",
    exploreTitle:"Découvrez votre environnement scientifique", exploreIntro:"Avant de créer votre compte, explorez l’univers NEXUS SCIENCE : apprentissage, sciences expérimentales et accompagnement de votre progression.",
    student:"Un environnement étudiant", studentText:"Une plateforme pensée pour organiser votre parcours et vos apprentissages.", practiceTitle:"Apprendre par la pratique", practiceBody:"Leçons, exercices et évaluations pour transformer les connaissances en compétences.", science:"Les sciences au cœur du parcours", scienceText:"Biologie, chimie, physiologie et autres disciplines scientifiques réunies dans un même espace.",
    platform:"Une plateforme conçue autour de votre parcours scientifique", platformText:"NEXUS SCIENCE organise l’apprentissage autour de contenus structurés, d’activités d’entraînement et d’un suivi progressif.",
    understand:"Comprendre les sciences", understandText:"Retrouvez des ressources organisées pour aborder les notions essentielles avec méthode.", pace:"Travailler à votre rythme", paceText:"Avancez étape par étape et revenez sur les notions qui nécessitent davantage d’entraînement.", tools:"Des outils numériques", toolsText:"La plateforme est conçue pour accueillir progressivement des outils d’apprentissage et d’assistance intelligents.",
    start:"Votre parcours de candidature", discoverStep:"Découvrez NEXUS SCIENCE", account:"Créez votre compte candidat", learn:"Constituez votre dossier", submit:"Suivez votre admission", step1:"Explorez les disciplines, les formations et les informations utiles avant de vous inscrire.", step2:"Créez votre espace personnel pour accéder à votre parcours candidat.", step3:"Renseignez les informations demandées et préparez les pièces de votre dossier.", step4:"Retrouvez les prochaines étapes et les décisions concernant votre candidature dans votre espace personnel.",
    available:"Cours disponibles", loading:"Chargement des cours…", none:"Aucun cours n’est publié pour le moment. Revenez bientôt.", view:"Voir les cours", signup:"Créer mon compte candidat", login:"Se connecter", learnMore:"Explorer les cours", footer:"Apprendre · Comprendre · Progresser"
  },
  en: {
    eyebrow:"NEXUS SCIENCE", title:"A structured, accessible science-learning environment designed to support your progress.",
    tagline:"Learn science with method and rigor.", intro:"NEXUS SCIENCE brings courses, lessons, exercises and assessments together in one platform designed to support every learner’s scientific journey.",
    discover:"Discover NEXUS SCIENCE", featuresTitle:"A place to learn, understand and progress", featuresIntro:"Explore scientific disciplines, browse courses and track your development in a personalized student space.",
    courses:"Courses & lessons", coursesText:"Subject-based content to build your knowledge step by step.", practice:"Exercises & quizzes", practiceText:"Assessments to check your knowledge and identify topics to revisit.", progress:"Progress tracking", progressText:"A personal space for your learning path and results.",
    exploreTitle:"Discover your scientific environment", exploreIntro:"Before creating an account, explore NEXUS SCIENCE: learning, experimental sciences and support for your progress.",
    student:"A student environment", studentText:"A platform designed to organize your learning journey.", practiceTitle:"Learn through practice", practiceBody:"Lessons, exercises and assessments that turn knowledge into skills.", science:"Science at the heart of learning", scienceText:"Biology, chemistry, physiology and other scientific disciplines in one place.",
    platform:"A platform built around your scientific journey", platformText:"NEXUS SCIENCE structures learning through organized content, practice activities and progressive tracking.",
    understand:"Understand science", understandText:"Find organized resources to approach essential concepts methodically.", pace:"Learn at your own pace", paceText:"Move step by step and revisit topics that need more practice.", tools:"Digital learning tools", toolsText:"The platform is designed to progressively welcome intelligent learning and support tools.",
    start:"Your application journey", discoverStep:"Discover NEXUS SCIENCE", account:"Create your candidate account", learn:"Prepare your application", submit:"Follow your admission", step1:"Explore the disciplines, courses and useful information before registering.", step2:"Create your personal space to access your candidate journey.", step3:"Provide the requested information and prepare your application documents.", step4:"Follow the next steps and decisions about your application in your personal space.",
    available:"Available courses", loading:"Loading courses…", none:"No courses are published yet. Please check back soon.", view:"View courses", signup:"Create my candidate account", login:"Sign in", learnMore:"Explore courses", footer:"Learn · Understand · Progress"
  },
  pt: {
    eyebrow:"NEXUS SCIENCE", title:"Um ambiente de aprendizagem científica estruturado, acessível e criado para acompanhar o seu progresso.",
    tagline:"Aprender ciências com método e rigor.", intro:"A NEXUS SCIENCE reúne cursos, aulas, exercícios e avaliações numa plataforma concebida para acompanhar cada estudante no seu percurso científico.",
    discover:"Descobrir NEXUS SCIENCE", featuresTitle:"Um espaço para aprender, compreender e progredir", featuresIntro:"Explore as disciplinas científicas, consulte os cursos e acompanhe a sua evolução num espaço estudantil personalizado.",
    courses:"Cursos e aulas", coursesText:"Conteúdos organizados por disciplina para construir conhecimentos gradualmente.", practice:"Exercícios e questionários", practiceText:"Avaliações para verificar os seus conhecimentos e identificar temas a rever.", progress:"Acompanhamento do progresso", progressText:"Um espaço pessoal para consultar o seu percurso e os resultados.",
    exploreTitle:"Descubra o seu ambiente científico", exploreIntro:"Antes de criar a sua conta, explore o universo NEXUS SCIENCE: aprendizagem, ciências experimentais e acompanhamento do seu progresso.",
    student:"Um ambiente estudantil", studentText:"Uma plataforma pensada para organizar o seu percurso e a sua aprendizagem.", practiceTitle:"Aprender na prática", practiceBody:"Aulas, exercícios e avaliações para transformar conhecimentos em competências.", science:"As ciências no centro do percurso", scienceText:"Biologia, química, fisiologia e outras disciplinas científicas reunidas num só espaço.",
    platform:"Uma plataforma concebida para o seu percurso científico", platformText:"A NEXUS SCIENCE organiza a aprendizagem com conteúdos estruturados, atividades práticas e acompanhamento progressivo.",
    understand:"Compreender as ciências", understandText:"Encontre recursos organizados para abordar os conceitos essenciais com método.", pace:"Aprender ao seu ritmo", paceText:"Avance passo a passo e reveja os temas que precisam de mais prática.", tools:"Ferramentas digitais", toolsText:"A plataforma foi concebida para integrar progressivamente ferramentas inteligentes de aprendizagem e assistência.",
    start:"O seu percurso de candidatura", discoverStep:"Descubra a NEXUS SCIENCE", account:"Crie a sua conta de candidato", learn:"Prepare a sua candidatura", submit:"Acompanhe a admissão", step1:"Explore as disciplinas, os cursos e as informações úteis antes de se registar.", step2:"Crie o seu espaço pessoal para aceder ao percurso de candidato.", step3:"Preencha as informações solicitadas e prepare os documentos da candidatura.", step4:"Acompanhe as próximas etapas e as decisões sobre a sua candidatura no seu espaço pessoal.",
    available:"Cursos disponíveis", loading:"A carregar os cursos…", none:"Ainda não existem cursos publicados. Volte em breve.", view:"Ver cursos", signup:"Criar a minha conta de candidato", login:"Iniciar sessão", learnMore:"Explorar cursos", footer:"Aprender · Compreender · Progredir"
  },
  es: {
    eyebrow:"NEXUS SCIENCE", title:"Un entorno de aprendizaje científico estructurado, accesible y diseñado para acompañar tu progreso.",
    tagline:"Aprender ciencias con método y rigor.", intro:"NEXUS SCIENCE reúne cursos, lecciones, ejercicios y evaluaciones en una plataforma diseñada para acompañar a cada estudiante en su recorrido científico.",
    discover:"Descubrir NEXUS SCIENCE", featuresTitle:"Un espacio para aprender, comprender y progresar", featuresIntro:"Explora las disciplinas científicas, consulta los cursos y sigue tu evolución en un espacio estudiantil personalizado.",
    courses:"Cursos y lecciones", coursesText:"Contenidos organizados por materia para construir conocimientos paso a paso.", practice:"Ejercicios y cuestionarios", practiceText:"Evaluaciones para comprobar tus conocimientos e identificar temas que debes repasar.", progress:"Seguimiento del progreso", progressText:"Un espacio personal para consultar tu recorrido y tus resultados.",
    exploreTitle:"Descubre tu entorno científico", exploreIntro:"Antes de crear tu cuenta, explora el universo NEXUS SCIENCE: aprendizaje, ciencias experimentales y apoyo a tu progreso.",
    student:"Un entorno estudiantil", studentText:"Una plataforma diseñada para organizar tu recorrido y aprendizaje.", practiceTitle:"Aprender con la práctica", practiceBody:"Lecciones, ejercicios y evaluaciones para convertir conocimientos en competencias.", science:"Las ciencias en el centro del recorrido", scienceText:"Biología, química, fisiología y otras disciplinas científicas reunidas en un mismo espacio.",
    platform:"Una plataforma diseñada para tu recorrido científico", platformText:"NEXUS SCIENCE organiza el aprendizaje con contenidos estructurados, actividades prácticas y seguimiento progresivo.",
    understand:"Comprender las ciencias", understandText:"Encuentra recursos organizados para abordar los conceptos esenciales con método.", pace:"Aprender a tu ritmo", paceText:"Avanza paso a paso y vuelve a los temas que necesitan más práctica.", tools:"Herramientas digitales", toolsText:"La plataforma está diseñada para incorporar progresivamente herramientas inteligentes de aprendizaje y asistencia.",
    start:"Tu proceso de candidatura", discoverStep:"Descubre NEXUS SCIENCE", account:"Crea tu cuenta de candidato", learn:"Prepara tu candidatura", submit:"Sigue tu admisión", step1:"Explora las disciplinas, los cursos y la información útil antes de registrarte.", step2:"Crea tu espacio personal para acceder a tu recorrido como candidato.", step3:"Completa la información solicitada y prepara los documentos de tu candidatura.", step4:"Consulta los próximos pasos y las decisiones sobre tu candidatura en tu espacio personal.",
    available:"Cursos disponibles", loading:"Cargando cursos…", none:"Todavía no hay cursos publicados. Vuelve pronto.", view:"Ver cursos", signup:"Crear mi cuenta de candidato", login:"Iniciar sesión", learnMore:"Explorar cursos", footer:"Aprender · Comprender · Progresar"
  }
} as const;

export default function Home({ language, search }: { language: Language; search: string }) {
  const { session } = useAuth();
  const t = copy[language];
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetchPublishedCourses(language).then((list) => { if (active) setCourses(list); }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [language]);
  const filteredCourses = useMemo(() => (courses ?? []).filter(course => `${course.name} ${course.category} ${course.description ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [courses, search]);
  return (
    <>
      <section className="hero" id="mission">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">🔬 {t.eyebrow}</p>
            <h1>{t.title}</h1>
            <h2 className="hero-tagline">{t.tagline}</h2>
            <p className="lead">{t.intro}</p>
            <div className="actions">
              <a className="btn primary" href="#decouvrir">{t.discover}</a>
              {!session && <><Link className="btn primary" to="/inscription">{t.signup}</Link><Link className="btn" to="/connexion">{t.login}</Link></>}
            </div>
          </div>
          <div className="hero-art anatomical-heart-stage">
            <img className="anatomical-heart" src="/images/c5de127827c76e8_file_00000000bcb0820ebaf339d6baecaa8a_speed_0.25.gif" alt="Visualisation anatomique 3D d’un cœur humain avec circulation sanguine rouge et bleue" loading="eager" />
            <span className="holo-label holo-label-top" aria-hidden="true">NEXUS / SCIENCE</span>
            <span className="holo-label holo-label-bottom" aria-hidden="true">EXPLORE · DISCOVER · LEARN</span>
          </div>
        </div>
      </section>

      <section className="wrap home-section" id="plateforme">
        <div className="section-heading"><p className="eyebrow">NEXUS SCIENCE</p><h2>{t.featuresTitle}</h2><p>{t.featuresIntro}</p></div>
        <div className="feature-grid">
          <article className="feature-card"><span className="feature-icon">📚</span><h3>{t.courses}</h3><p>{t.coursesText}</p></article>
          <article className="feature-card"><span className="feature-icon">🧪</span><h3>{t.practice}</h3><p>{t.practiceText}</p></article>
          <article className="feature-card"><span className="feature-icon">📊</span><h3>{t.progress}</h3><p>{t.progressText}</p></article>
        </div>
      </section>

      <section className="showcase-section" id="decouvrir">
        <div className="wrap home-section">
          <div className="section-heading"><p className="eyebrow">EXPLORE · DISCOVER · LEARN</p><h2>{t.exploreTitle}</h2><p>{t.exploreIntro}</p></div>
          <div className="showcase-grid">
            <article className="showcase-card"><div className="showcase-visual student-visual" aria-hidden="true">🎓</div><div><h3>{t.student}</h3><p>{t.studentText}</p></div></article>
            <article className="showcase-card"><div className="showcase-visual practice-visual" aria-hidden="true">🧫</div><div><h3>{t.practiceTitle}</h3><p>{t.practiceBody}</p></div></article>
            <article className="showcase-card"><div className="showcase-visual science-visual" aria-hidden="true">🧬</div><div><h3>{t.science}</h3><p>{t.scienceText}</p></div></article>
          </div>
        </div>
      </section>

      <section className="wrap home-section" id="apprendre">
        <div className="section-heading"><p className="eyebrow">LEARNING PATH</p><h2>{t.platform}</h2><p>{t.platformText}</p></div>
        <div className="benefit-grid">
          <article><span>🧬</span><div><h3>{t.understand}</h3><p>{t.understandText}</p></div></article>
          <article><span>🎯</span><div><h3>{t.pace}</h3><p>{t.paceText}</p></div></article>
          <article><span>🤖</span><div><h3>{t.tools}</h3><p>{t.toolsText}</p></div></article>
        </div>
      </section>

      <section className="start-section" id="parcours">
        <div className="wrap home-section">
          <div className="section-heading"><p className="eyebrow">YOUR JOURNEY</p><h2>{t.start}</h2></div>
          <ol className="steps-grid">
            <li><span>01</span><h3>{t.discoverStep}</h3><p>{t.step1}</p></li>
            <li><span>02</span><h3>{t.account}</h3><p>{t.step2}</p></li>
            <li><span>03</span><h3>{t.learn}</h3><p>{t.step3}</p></li>
            <li><span>04</span><h3>{t.submit}</h3><p>{t.step4}</p></li>
          </ol>
        </div>
      </section>

      <section id="formations" className="wrap home-section courses-section" aria-labelledby="titre-cours">
        <div className="section-heading"><p className="eyebrow">NEXUS SCIENCE</p><h2 id="titre-cours">{t.available}</h2></div>
        {error && <p className="notice error" role="alert">{error}</p>}
        {!error && courses === null && <p className="muted" role="status">{t.loading}</p>}
        {courses && filteredCourses.length === 0 && <p className="notice">{search ? (language === "fr" ? "Aucun cours ne correspond à votre recherche." : language === "pt" ? "Nenhum curso corresponde à sua pesquisa." : language === "es" ? "Ningún curso coincide con tu búsqueda." : "No courses match your search.") : t.none}</p>}
        <ul className="cards">
          {filteredCourses.map((course) => (
            <li key={course.id} className="card">
              <p className="tag">{course.category}</p><h3><Link to={`/cours/${course.id}`}>{course.name}</Link></h3>
              {course.description && <p className="clamp">{course.description}</p>}
              <ul className="sessions" aria-label="Sessions">
                {course.course_schedules.length === 0 && <li className="muted">Aucune session publiée</li>}
                {course.course_schedules.map((item) => { const state = sessionState(item); return <li key={item.start_date + item.end_date}><span className={`pill ${state}`}>{sessionStateLabel[language][state]}</span> {formatRange(item, language)}</li>; })}
              </ul>
              <Link className="more" to={`/cours/${course.id}`}>{t.learnMore} →</Link>
            </li>
          ))}
        </ul>
        <div className="courses-cta"><a className="btn primary" href="#formations">{t.view}</a></div>
      </section>
    </>
  );
}
