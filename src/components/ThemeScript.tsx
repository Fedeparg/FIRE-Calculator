// Script de tema renderizado en SERVIDOR. Se ejecuta antes del primer paint para
// aplicar la clase `.dark` desde localStorage o la preferencia del sistema (sin
// parpadeo). Al ser un componente de servidor, no dispara el warning de React 19
// sobre <script> en componentes de cliente.
const themeInit = `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeInit }} />;
}
