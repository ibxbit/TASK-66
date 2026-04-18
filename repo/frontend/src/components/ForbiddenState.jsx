function ForbiddenState({ title = 'Forbidden', description = 'Insufficient permission.' }) {
  return (
    <article className="card forbidden-state" role="status" aria-live="polite">
      <h2>{title}</h2>
      <p className="notice err">Forbidden: insufficient permission for this area.</p>
      <p className="small">{description}</p>
    </article>
  );
}

export default ForbiddenState;
