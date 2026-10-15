import base64
import subprocess
import os

img_logo_path = r"C:/Users/marti/.gemini/antigravity/brain/4a634cb0-c2db-4c17-97ed-cac11b584e52/.user_uploaded/media_1790725424655.jpg"
img_banner_path = r"C:/Users/marti/.gemini/antigravity/brain/4a634cb0-c2db-4c17-97ed-cac11b584e52/.user_uploaded/media_1790725465619.png"

with open(img_logo_path, "rb") as f:
    logo_b64 = base64.b64encode(f.read()).decode("utf-8")

with open(img_banner_path, "rb") as f:
    banner_b64 = base64.b64encode(f.read()).decode("utf-8")

html_content = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@700;900&display=swap');
  
  @page {{
    size: A4 portrait;
    margin: 14mm 16mm;
  }}

  * {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }}

  body {{
    font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
    color: #1e293b;
    background: #ffffff;
    font-size: 10pt;
    line-height: 1.5;
  }}

  .page {{
    page-break-after: always;
    padding-bottom: 20px;
  }}

  .page:last-child {{
    page-break-after: avoid;
  }}

  /* Header de cada página */
  .doc-header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1.5px solid #0f223d;
    padding-bottom: 10px;
    margin-bottom: 20px;
  }}

  .doc-header .brand-title {{
    font-size: 13pt;
    font-weight: 900;
    color: #0f223d;
    letter-spacing: -0.3px;
  }}

  .doc-header .doc-subtitle {{
    font-size: 8pt;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }}

  .doc-header .date {{
    font-size: 8pt;
    color: #0284c7;
    font-weight: 700;
  }}

  /* Portada */
  .cover {{
    text-align: center;
    padding: 40px 20px 20px 20px;
  }}

  .cover-banner {{
    max-width: 100%;
    max-height: 140px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(15, 34, 61, 0.15);
    margin-bottom: 25px;
    border: 1px solid #cbd5e1;
  }}

  .cover-title {{
    font-size: 23pt;
    font-weight: 900;
    color: #0a192f;
    line-height: 1.15;
    margin-bottom: 10px;
    letter-spacing: -0.5px;
  }}

  .cover-badge {{
    display: inline-block;
    background: #e0f2fe;
    color: #0369a1;
    font-weight: 800;
    font-size: 8.5pt;
    padding: 5px 14px;
    border-radius: 9999px;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 20px;
    border: 1px solid #bae6fd;
  }}

  .cover-desc {{
    font-size: 11pt;
    color: #475569;
    max-width: 580px;
    margin: 0 auto 35px auto;
    line-height: 1.6;
  }}

  .asset-showcase {{
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 30px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 30px;
  }}

  .asset-card {{
    text-align: center;
  }}

  .asset-card img {{
    height: 110px;
    border-radius: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  }}

  .asset-card p {{
    font-size: 8pt;
    font-weight: 700;
    color: #64748b;
    margin-top: 8px;
    text-transform: uppercase;
  }}

  .cover-meta {{
    font-size: 8.5pt;
    color: #94a3b8;
    border-top: 1px solid #e2e8f0;
    padding-top: 15px;
  }}

  /* Secciones */
  .section-title {{
    font-size: 14pt;
    font-weight: 800;
    color: #0f223d;
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
  }}

  .section-intro {{
    font-size: 9.5pt;
    color: #475569;
    margin-bottom: 18px;
  }}

  /* Tarjetas de opciones */
  .option-card {{
    background: #ffffff;
    border: 1.5px solid #e2e8f0;
    border-radius: 14px;
    padding: 16px 18px;
    margin-bottom: 16px;
    page-break-inside: avoid;
  }}

  .option-card.highlight {{
    border-color: #0284c7;
    background: #f0f9ff;
    box-shadow: 0 4px 16px rgba(2, 132, 199, 0.08);
  }}

  .option-header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }}

  .option-name {{
    font-size: 12pt;
    font-weight: 800;
    color: #0f223d;
  }}

  .option-tag {{
    font-size: 7.5pt;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 999px;
    text-transform: uppercase;
  }}

  .tag-rec {{
    background: #0284c7;
    color: #ffffff;
  }}

  .tag-alt {{
    background: #e2e8f0;
    color: #475569;
  }}

  .palette-bar {{
    display: flex;
    height: 38px;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 12px;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);
  }}

  .swatch {{
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: #ffffff;
    font-size: 7pt;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(0,0,0,0.6);
  }}

  .swatch span.hex {{
    font-family: monospace;
    font-size: 6.5pt;
    opacity: 0.9;
  }}

  .option-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    font-size: 8.5pt;
  }}

  .option-col strong {{
    color: #0f223d;
    display: block;
    margin-bottom: 3px;
  }}

  .option-col p {{
    color: #475569;
    line-height: 1.4;
  }}

  /* Ubicaciones de Logo */
  .placement-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-top: 15px;
  }}

  .placement-card {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px;
    page-break-inside: avoid;
  }}

  .placement-number {{
    display: inline-block;
    width: 22px;
    height: 22px;
    line-height: 22px;
    text-align: center;
    background: #0f223d;
    color: white;
    font-size: 8pt;
    font-weight: 800;
    border-radius: 6px;
    margin-bottom: 6px;
  }}

  .placement-title {{
    font-size: 10pt;
    font-weight: 800;
    color: #0f223d;
    margin-bottom: 4px;
  }}

  .placement-desc {{
    font-size: 8.5pt;
    color: #475569;
    line-height: 1.45;
  }}

  .placement-impact {{
    font-size: 7.5pt;
    color: #0284c7;
    font-weight: 700;
    margin-top: 6px;
  }}

  /* Tabla comparativa */
  table.comp-table {{
    width: 100%;
    border-collapse: collapse;
    margin-top: 15px;
    font-size: 8.5pt;
  }}

  table.comp-table th {{
    background: #0f223d;
    color: white;
    padding: 8px 10px;
    text-align: left;
    font-size: 8pt;
    font-weight: 800;
    text-transform: uppercase;
  }}

  table.comp-table td {{
    padding: 9px 10px;
    border-bottom: 1px solid #e2e8f0;
  }}

  table.comp-table tr:nth-child(even) {{
    background: #f8fafc;
  }}

  .footer-note {{
    margin-top: 25px;
    padding: 14px;
    background: #eff6ff;
    border-left: 4px solid #0284c7;
    border-radius: 0 8px 8px 0;
    font-size: 8.5pt;
    color: #1e3a8a;
  }}
</style>
</head>
<body>

  <!-- PÁGINA 1: PORTADA Y VALORES DE MARCA -->
  <div class="page">
    <div class="doc-header">
      <div>
        <div class="brand-title">TRITÓN &bull; Lavadero Industrial</div>
        <div class="doc-subtitle">Propuesta de Rediseño de Identidad Visual y Paleta Cromática</div>
      </div>
      <div class="date">Septiembre 2026</div>
    </div>

    <div class="cover">
      <div class="cover-badge">Identidad Corporativa &bull; BI Tool</div>
      <h1 class="cover-title">Rediseño de Marca y Experiencia de Usuario (UI/UX)</h1>
      <p class="cover-desc">
        Alineación visual del sistema de Business Intelligence y Trazabilidad Operativa con la marca real de <strong>Tritón Lavadero Industrial</strong>, consolidando una imagen seria, moderna y de alto estándar para el sector hotelero.
      </p>

      <img class="cover-banner" src="data:image/png;base64,{banner_b64}" alt="Banner Tritón">

      <div class="asset-showcase">
        <div class="asset-card">
          <img src="data:image/jpeg;base64,{logo_b64}" alt="Logo Silueta">
          <p>Isotipo Oficial (Silueta Marina)</p>
        </div>
        <div class="asset-card" style="text-align: left; max-width: 320px;">
          <h4 style="font-size: 10pt; color: #0f223d; font-weight: 800; margin-bottom: 4px;">Valores Transmitidos:</h4>
          <ul style="font-size: 8.5pt; color: #475569; padding-left: 16px; line-height: 1.5;">
            <li><strong>Fuerza y Solidez:</strong> Autoridad industrial y gran escala de procesamiento.</li>
            <li><strong>Pureza del Agua:</strong> Degradé marino con resplandor central que evoca limpieza absoluta.</li>
            <li><strong>Perfil B2B:</strong> Sobriedad ejecutiva para gerentes y gobernantas de hoteles.</li>
          </ul>
        </div>
      </div>

      <div class="cover-meta">
        Documento Técnico y Visual preparado para Poseidón / Tritón SRL &bull; Tesis de Analista de Sistemas
      </div>
    </div>
  </div>

  <!-- PÁGINA 2: LAS 3 PROPUESTAS CROMÁTICAS -->
  <div class="page">
    <div class="doc-header">
      <div>
        <div class="brand-title">TRITÓN &bull; Lavadero Industrial</div>
        <div class="doc-subtitle">Paletas de Colores Propuestas</div>
      </div>
      <div class="date">Página 2 de 3</div>
    </div>

    <div class="section-title">🎨 Tres Alternativas de Rediseño Cromático</div>
    <p class="section-intro">
      Se diseñaron tres combinaciones basadas en los elementos visuales del banner y el isotipo de la empresa, pensadas para pantallas ejecutivas y dispositivos móviles.
    </p>

    <!-- Opción 1 -->
    <div class="option-card highlight">
      <div class="option-header">
        <div class="option-name">Opción 1: «Océano Corporativo» (Recomendada)</div>
        <span class="option-tag tag-rec">100% Fiel a Redes</span>
      </div>
      <div class="palette-bar">
        <div class="swatch" style="background: #071326;">Fondo Noche<br><span class="hex">#071326</span></div>
        <div class="swatch" style="background: #0d1d36;">Tarjetas<br><span class="hex">#0D1D36</span></div>
        <div class="swatch" style="background: #1e3a8a;">Azul Marino<br><span class="hex">#1E3A8A</span></div>
        <div class="swatch" style="background: #0284c7;">Cobalto Tridente<br><span class="hex">#0284C7</span></div>
        <div class="swatch" style="background: #38bdf8; color: #071326; text-shadow: none;">Celeste Agua<br><span class="hex">#38BDF8</span></div>
        <div class="swatch" style="background: #ffffff; color: #071326; text-shadow: none;">Blanco Puro<br><span class="hex">#FFFFFF</span></div>
      </div>
      <div class="option-grid">
        <div class="option-col">
          <strong>Concepto y Atmósfera:</strong>
          <p>Reproduce exactamente los tonos del banner de Instagram. El fondo abandona el gris neutro para tomar el azul noche oceánico. Transmite confianza absoluta, serenidad y pulcritud.</p>
        </div>
        <div class="option-col">
          <strong>Aplicación en UI:</strong>
          <p>Botones y gráficos en azul cobalto y celeste agua. El texto blanco y plateado ofrece máximo contraste y descanso visual en jornadas prolongadas de carga o análisis.</p>
        </div>
      </div>
    </div>

    <!-- Opción 2 -->
    <div class="option-card">
      <div class="option-header">
        <div class="option-name">Opción 2: «Tridente Premium B2B»</div>
        <span class="option-tag tag-alt">Estilo Suite Hotelera</span>
      </div>
      <div class="palette-bar">
        <div class="swatch" style="background: #0a1120;">Medianoche<br><span class="hex">#0A1120</span></div>
        <div class="swatch" style="background: #112240;">Azul Profundo<br><span class="hex">#112240</span></div>
        <div class="swatch" style="background: #233554;">Acero Oscuro<br><span class="hex">#233554</span></div>
        <div class="swatch" style="background: #64ffda; color: #0a1120; text-shadow: none;">Aqua Neón<br><span class="hex">#64FFDA</span></div>
        <div class="swatch" style="background: #cbd5e1; color: #0a1120; text-shadow: none;">Plata Satinada<br><span class="hex">#CBD5E1</span></div>
      </div>
      <div class="option-grid">
        <div class="option-col">
          <strong>Concepto y Atmósfera:</strong>
          <p>Inspirado en plataformas de gestión hotelera de cadenas 5 estrellas. Acentos metálicos plateados con detalles de luz turquesa que recuerdan a la iluminación de piscinas y spas.</p>
        </div>
        <div class="option-col">
          <strong>Aplicación en UI:</strong>
          <p>Ideal para presentar a inversores o tribunales académicos por su acabado sofisticado y bordes finos con degradados plateados.</p>
        </div>
      </div>
    </div>

    <!-- Opción 3 -->
    <div class="option-card">
      <div class="option-header">
        <div class="option-name">Opción 3: «Híbrido Operativo» (Dark en Admin / White en Celular)</div>
        <span class="option-tag tag-alt">Ergonomía Móvil</span>
      </div>
      <div class="palette-bar">
        <div class="swatch" style="background: #0f172a;">Admin Slate<br><span class="hex">#0F172A</span></div>
        <div class="swatch" style="background: #1d4ed8;">Azul Real<br><span class="hex">#1D4ED8</span></div>
        <div class="swatch" style="background: #f8fafc; color: #0f172a; text-shadow: none;">Móvil Blanco<br><span class="hex">#F8FAFC</span></div>
        <div class="swatch" style="background: #10b981;">Esmeralda OK<br><span class="hex">#10B981</span></div>
        <div class="swatch" style="background: #e2e8f0; color: #0f172a; text-shadow: none;">Gris Claro<br><span class="hex">#E2E8F0</span></div>
      </div>
      <div class="option-grid">
        <div class="option-col">
          <strong>Concepto y Atmósfera:</strong>
          <p>Enfoque dual pragmático: en computadoras de oficina (Admin) mantiene el tono oscuro, pero en celulares de mucamas adopta un fondo blanco brillante con cabezal azul marino.</p>
        </div>
        <div class="option-col">
          <strong>Aplicación en UI:</strong>
          <p>Máxima legibilidad para el personal que opera teléfonos móviles en lavanderías y depósitos con poca o mucha iluminación artificial.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- PÁGINA 3: UBICACIÓN ESTRATÉGICA DEL LOGO Y COMPARATIVA -->
  <div class="page">
    <div class="doc-header">
      <div>
        <div class="brand-title">TRITÓN &bull; Lavadero Industrial</div>
        <div class="doc-subtitle">Ubicación del Logo y Próximos Pasos</div>
      </div>
      <div class="date">Página 3 de 3</div>
    </div>

    <div class="section-title">📍 Ubicación Estratégica del Logo en la Plataforma</div>
    <p class="section-intro">
      Puntos clave de contacto donde la integración del logo potencia la identidad corporativa:
    </p>

    <div class="placement-grid">
      <div class="placement-card">
        <div class="placement-number">1</div>
        <div class="placement-title">Navbar Principal (Header Superior)</div>
        <div class="placement-desc">
          Reemplazo del ícono genérico por el <strong>Isotipo del Tridente en silueta blanca</strong> dentro de un medallón azul con resplandor suave. A su lado, el texto <strong>TRITÓN</strong> con subtítulo <em>Lavadero Industrial</em>.
        </div>
        <div class="placement-impact">★ Visible en el 100% de la navegación de usuarios.</div>
      </div>

      <div class="placement-card">
        <div class="placement-number">2</div>
        <div class="placement-title">Pantalla de Login / Acceso</div>
        <div class="placement-desc">
          El banner apaisado completo presidirá el formulario de ingreso. Da bienvenida institucional a clientes y operarios con el efecto de iluminación central sobre el logo.
        </div>
        <div class="placement-impact">★ Primera impresión de seguridad y profesionalismo.</div>
      </div>

      <div class="placement-card">
        <div class="placement-number">3</div>
        <div class="placement-title">Documentos Imprimibles (A4 y Remitos)</div>
        <div class="placement-desc">
          En las hojas de <strong>Liquidación Mensual</strong> y los <strong>Remitos con Código QR</strong> que viajan en el camión. Se imprime el imagotipo oficial en alta resolución a la izquierda del CUIT.
        </div>
        <div class="placement-impact">★ Validez formal y prestigio ante la gerencia hotelera.</div>
      </div>

      <div class="placement-card">
        <div class="placement-number">4</div>
        <div class="placement-title">Portal Móvil de Mucamas y Favicon</div>
        <div class="placement-desc">
          El tridente como ícono de pestaña de navegador y como ícono de App Móvil (PWA) al guardar en pantalla de inicio. En la cabecera móvil: <em>"Operado por Tritón Lavadero Industrial"</em>.
        </div>
        <div class="placement-impact">★ Presencia constante en los celulares de los hoteles.</div>
      </div>
    </div>

    <div class="section-title" style="margin-top: 25px;">📊 Cuadro Comparativo de Opciones</div>

    <table class="comp-table">
      <thead>
        <tr>
          <th>Propuesta</th>
          <th>Fidelidad a Redes</th>
          <th>Impacto Visual</th>
          <th>Uso en Celulares</th>
          <th>Recomendación</th>
        </tr>
      </thead>
      <tbody>
        <tr style="font-weight: 700;">
          <td style="color: #0284c7;">Opción 1: Océano Corporativo</td>
          <td>★★★★★ (Exacta)</td>
          <td>★★★★★ (Alto)</td>
          <td>★★★★☆ (Muy bueno)</td>
          <td>⭐ Más recomendada</td>
        </tr>
        <tr>
          <td>Opción 2: Tridente Premium</td>
          <td>★★★★☆ (Cercana)</td>
          <td>★★★★★ (Lujoso)</td>
          <td>★★★☆☆ (Medio)</td>
          <td>Para perfil alta gama</td>
        </tr>
        <tr>
          <td>Opción 3: Híbrido Operativo</td>
          <td>★★★☆☆ (Variada)</td>
          <td>★★★★☆ (Funcional)</td>
          <td>★★★★★ (Óptimo)</td>
          <td>Para uso intensivo en móvil</td>
        </tr>
      </tbody>
    </table>

    <div class="footer-note">
      <strong>Conclusión y Siguiente Paso:</strong><br>
      Recomendamos adoptar la <strong>Opción 1 («Océano Corporativo»)</strong> unificando el nombre a <strong>"TRITÓN Lavadero Industrial"</strong>. Esto logrará una coherencia total entre las redes sociales, los remitos impresos y la plataforma digital de Business Intelligence.
    </div>
  </div>

</body>
</html>
"""

html_path = r"c:\Users\marti\OneDrive\Documentos\BITool\lavadero-bi\propuesta_redisenio.html"
pdf_path = r"c:\Users\marti\OneDrive\Documentos\BITool\lavadero-bi\Propuesta_Redisenio_Triton_BI.pdf"
pdf_root_path = r"c:\Users\marti\OneDrive\Documentos\BITool\Propuesta_Redisenio_Triton_BI.pdf"

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

edge_exe = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
cmd = [
    edge_exe,
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    f"--print-to-pdf={pdf_path}",
    html_path,
]

result = subprocess.run(cmd, capture_output=True, text=True)
print("Return code:", result.returncode)

if os.path.exists(pdf_path):
    print("PDF generated successfully:", pdf_path, os.path.getsize(pdf_path), "bytes")
    # Copiar también al directorio raíz para máxima comodidad
    with open(pdf_path, "rb") as src, open(pdf_root_path, "wb") as dst:
        dst.write(src.read())
    print("Copied to root:", pdf_root_path)
else:
    print("Error generating PDF:", result.stderr)
