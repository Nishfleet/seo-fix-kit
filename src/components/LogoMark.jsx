export function LogoMark() {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      fill="none"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect className="mark-tile" height="48" rx="10" width="48" />
      <path
        className="mark-ring"
        d="M20.5 29.5a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
      />
      <path className="mark-handle" d="m27.2 27.2 8 8" />
      <path className="mark-check" d="m16.2 20.8 3.1 3.1 6.2-7.1" />
      <path className="mark-receipt" d="M12 34.5h13.5M12 39h22" />
    </svg>
  );
}
