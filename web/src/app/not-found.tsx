import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap">
      <section className="page-hero" style={{ textAlign: "center", padding: "90px 0" }}>
        <div style={{ fontSize: 110, lineHeight: 1, marginBottom: 20 }}>🫥</div>
        <h1>404. This table&apos;s <span className="serif">empty.</span></h1>
        <p style={{ margin: "18px auto 28px" }}>The page you&apos;re looking for isn&apos;t here — but there&apos;s a plan on tonight.</p>
        <Link className="btn btn-sun" href="/events/">See what&apos;s on →</Link>
      </section>
    </div>
  );
}
