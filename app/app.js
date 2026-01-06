:root{
  --lb-bg:#050716;--lb-card:#121733;--lb-accent-blue:#5ad1ff;--lb-accent-purple:#c287ff;--lb-accent-white:#fdfcff;--lb-muted:#a8a9c7;--lb-danger:#ff5c7a;--lb-radius-lg:24px;--lb-radius-md:16px;--lb-radius-pill:999px;--lb-shadow-soft:0 0 35px rgba(90,209,255,0.28);--lb-shadow-purple:0 0 40px rgba(194,135,255,0.35);--lb-font-main:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
*{box-sizing:border-box}
body{margin:0;padding:0;font-family:var(--lb-font-main);background:radial-gradient(circle at top,#20245a 0,#050716 40%,#02010a 100%);color:var(--lb-accent-white);min-height:100vh}
#app{max-width:1100px;margin:0 auto;padding:16px}
.lb-header{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-radius:var(--lb-radius-pill);background:linear-gradient(135deg,rgba(10,13,40,0.95),rgba(14,19,52,0.95));box-shadow:var(--lb-shadow-soft);margin-bottom:22px;position:sticky;top:10px;z-index:10;backdrop-filter:blur(18px)}
.lb-logo-bubble{display:inline-flex;flex-direction:column;padding:8px 16px;border-radius:var(--lb-radius-pill);background:radial-gradient(circle at 10% 10%,rgba(90,209,255,0.9),rgba(12,8,36,0.95));box-shadow:var(--lb-shadow-purple)}
.lb-logo-main{font-size:18px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase}
.lb-logo-sub{font-size:14px;opacity:0.9;letter-spacing:0.2em;text-transform:uppercase}
.lb-nav{display:flex;gap:8px}
.lb-nav-btn{border:none;outline:none;cursor:pointer;border-radius:var(--lb-radius-pill);padding:8px 14px;background:rgba(13,18,48,0.8);color:var(--lb-accent-white);font-size:13px;text-transform:uppercase;letter-spacing:0.09em;transition:background .2s,transform .1s}
.lb-nav-btn:hover{background:rgba(90,209,255,0.18);transform:translateY(-1px)}
.lb-main{padding-bottom:30px}
.lb-screen{animation:fadeIn .25s ease-out}
.lb-hidden{display:none!important}
.lb-card{background:linear-gradient(145deg,rgba(11,15,42,0.98),rgba(12,8,36,0.98));border-radius:var(--lb-radius-lg);padding:20px 22px;box-shadow:var(--lb-shadow-soft);border:1px solid rgba(90,209,255,0.2);position:relative;overflow:hidden}
.lb-card-sub{margin-top:18px;padding-top:14px;border-top:1px dashed rgba(168,169,199,0.35)}
.lb-hero-card{position:relative;overflow:visible}
.lb-hero-bubbles{position:absolute;inset:-60px -40px auto auto;pointer-events:none;opacity:.42}
.lb-hero-bubble{border-radius:50%;position:absolute;background:radial-gradient(circle at 30% 20%,rgba(255,255,255,0.9),rgba(90,209,255,0.2));box-shadow:0 0 24px rgba(90,209,255,0.5)}
.lb-hero-bubble.big{width:180px;height:180px;top:-20px;right:-40px}
.lb-hero-bubble.medium{width:110px;height:110px;top:80px;right:30px}
.lb-hero-bubble.small{width:70px;height:70px;top:0;right:120px}
h1,h2,h3,h4{margin:4px 0 10px 0;font-weight:700}
h1{font-size:24px;letter-spacing:.08em;text-transform:uppercase}
h2{font-size:19px;letter-spacing:.06em;text-transform:uppercase}
.lb-tagline{color:var(--lb-muted);margin-bottom:18px}
.lb-form{display:flex;flex-direction:column;gap:12px;margin-top:8px}
.lb-form label{display:flex;flex-direction:column;gap:6px;font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:var(--lb-muted)}
.lb-form input, .lb-form select, .lb-form textarea{border-radius:var(--lb-radius-md);border:1px solid rgba(90,209,255,0.25);background:rgba(5,8,28,0.95);color:var(--lb-accent-white);padding:10px 12px;font-size:14px;outline:none;transition:border .15s,box-shadow .15s,background .15s}
.lb-form input:focus, .lb-form select:focus, .lb-form textarea:focus{border-color:rgba(194,135,255,0.9);box-shadow:var(--lb-shadow-purple);background:rgba(7,11,35,1)}
.lb-form textarea{min-height:70px;resize:vertical}
button{font-family:var(--lb-font-main)}
.lb-primary, .lb-secondary, .lb-danger{border-radius:var(--lb-radius-pill);border:none;padding:10px 18px;font-size:13px;text-transform:uppercase;letter-spacing:.12em;cursor:pointer;transition:transform .08s,box-shadow .1s,background .1s}
.lb-primary{background:linear-gradient(135deg,var(--lb-accent-blue),var(--lb-accent-purple));color:#050716;box-shadow:0 0 22px rgba(90,209,255,0.6)}
.lb-primary:hover{transform:translateY(-1px);box-shadow:0 0 30px rgba(194,135,255,0.9)}
.lb-secondary{background:rgba(90,209,255,0.12);color:var(--lb-accent-white);border:1px solid rgba(90,209,255,0.4)}
.lb-secondary:hover{background:rgba(90,209,255,0.18)}
.lb-danger{background:rgba(255,92,122,0.16);color:#ffd5dd;border:1px solid rgba(255,92,122,0.6)}
.lb-danger:hover{background:rgba(255,92,122,0.28)}
.lb-role-section{margin-top:18px}
.lb-role-buttons{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
.lb-role-btn{border-radius:40px;border:1px solid rgba(90,209,255,0.4);background:radial-gradient(circle at top left,rgba(90,209,255,0.22),rgba(12,9,40,0.9));color:var(--lb-accent-white);padding:12px 16px;flex:1 1 160px;text-align:center;cursor:pointer;font-size:14px}
.lb-map-panel{margin-top:10px}
.lb-map-header{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.lb-map-placeholder{border-radius:var(--lb-radius-lg);background:radial-gradient(circle at top,rgba(90,209,255,0.18),rgba(9,10,33,0.96));padding:14px;border:1px dashed rgba(90,209,255,0.35)}
.lb-map-placeholder p{margin:0 0 8px 0;font-size:13px;color:var(--lb-muted);text-transform:uppercase;letter-spacing:.16em}
.lb-list{list-style:none;padding:0;margin:0}
.lb-list-item{padding:10px;border-radius:14px;margin-bottom:8px;background:rgba(11,15,42,0.95);border:1px solid rgba(90,209,255,0.18);display:flex;justify-content:space-between;align-items:center;gap:10px}
.lb-list-item-main{display:flex;flex-direction:column;gap:3px}
.lb-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;background:rgba(90,209,255,0.16);color:var(--lb-accent-white)}
.lb-grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.lb-muted{color:var(--lb-muted);font-size:13px}
.lb-job-total{margin-top:6px;font-size:13px}
.lb-switch{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer}
.lb-switch input{width:18px;height:18px}
#toast-container{position:fixed;bottom:16px;right:16px;display:flex;flex-direction:column;gap:8px;z-index:50}
.lb-toast{background:rgba(7,10,33,0.98);color:var(--lb-accent-white);padding:10px 16px;border-radius:var(--lb-radius-pill);border:1px solid rgba(90,209,255,0.55);box-shadow:var(--lb-shadow-soft);font-size:13px}
.lb-photo-preview{margin-top:8px;border-radius:12px;overflow:hidden;border:1px solid rgba(90,209,255,0.12);max-width:160px}
.lb-photo-preview img{display:block;width:100%;height:auto}
.lb-gallery-preview{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.lb-gallery-preview .thumb{width:120px;height:80px;border-radius:10px;overflow:hidden;background:#07102a;border:1px solid rgba(90,209,255,0.12);display:flex;align-items:center;justify-content:center}
.lb-gallery-preview video{width:100%;height:100%;object-fit:cover}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:720px){.lb-header{flex-direction:column;align-items:flex-start;gap:8px}.lb-nav{width:100%;justify-content:space-between}}
