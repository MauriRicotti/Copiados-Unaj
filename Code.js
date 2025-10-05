const firebaseConfig = {
  apiKey: "AIzaSyC0YFv49AUWjZtEl2KxgiytnFG4bzv5sMA",
  authDomain: "fotocopiado-unaj.firebaseapp.com",
  databaseURL: "https://fotocopiado-unaj-default-rtdb.firebaseio.com/",
  projectId: "fotocopiado-unaj",
  storageBucket: "fotocopiado-unaj.appspot.com",
  messagingSenderId: "198572714385",
  appId: "1:198572714385:web:2ec73dfa4386daa47a5230",
  measurementId: "G-SNQ58PSQJ2",
}

function obtenerNombreTurno(turno) {
  if (turno === "TM") return "Mañana";
  if (turno === "TT") return "Tarde";
  if (turno === "TU") return "Turno único";
  return turno;
}


let contrasenasDinamicas = null;

async function cargarContrasenasDinamicas() {
  if (window.firebaseInitialized && window.firebaseDatabase) {
    try {
      const ref = window.firebaseRef(window.firebaseDatabase, "contrasenas");
      const snap = await window.firebaseGet(ref);
      if (snap.exists()) {
        contrasenasDinamicas = snap.val();
        return;
      }
    } catch (e) {}
  }
  function getLS(key, def) {
    const val = localStorage.getItem(key);
    if (!val) return { actual: def, anterior: "" };
    try {
      const obj = JSON.parse(val);
      if (typeof obj === "object" && obj.actual) return obj;
      return { actual: obj, anterior: "" };
    } catch {
      return { actual: val, anterior: "" };
    }
  }
  contrasenasDinamicas = {
    salud: getLS("passSalud", "salud123"),
    sociales: getLS("passSociales", "sociales123"),
    ingenieria: getLS("passIngenieria", "ingenieria123"),
    hec_salud: getLS("passHEC", "hec123"),
    admin: getLS("passAdmin", "admin123")
  };
}

const calcInstitutos = {
  salud: {
    name: "Copiado de Salud",
    fullName: "Calculadora de cobro y registro de ventas",
    password: "salud123",
  },
  sociales: {
    name: "Copiado de Sociales",
    fullName: "Calculadora de cobro y registro de ventas",
    password: "sociales123",
  },
  ingenieria: {
    name: "Copiado de Ingeniería",
    fullName: "Calculadora de cobro y registro de ventas",
    password: "ingenieria123",
  },
  hec_salud: {
    name: "Copiado de HEC Salud",
    fullName: "Calculadora de cobro y registro de ventas",
    password: "hec123",
  },
};

let firebaseApp
let database
let isFirebaseEnabled = false
let deviceId
let currentFotocopiado
let calcRegistroVentas = {
  efectivo: 0,
  transferencia: 0,
  ventas: [],
}
let calcContadorArchivos = 0
let calcArchivos = []
let calcTotal = 0
let calcMetodoPago
let selectedFotocopiado

const comparativaCharts = {
  ingresos: null,
  metodos: null,
}

let currentTurno = localStorage.getItem("currentTurno") || "TM";
let cameFromLogin = false;

function calcCargarTema() {
  const temaGuardado = localStorage.getItem("calcTema") || "light"
  document.documentElement.setAttribute("data-theme", temaGuardado)
}

function calcToggleTheme() {
  const temaActual = document.documentElement.getAttribute("data-theme")
  const nuevoTema = temaActual === "dark" ? "light" : "dark"

  document.documentElement.setAttribute("data-theme", nuevoTema)
  localStorage.setItem("calcTema", nuevoTema)
}

document.addEventListener("DOMContentLoaded", async () => {
  calcCargarTema();
  generateDeviceId();
  checkExistingSession();
  addOutsideClickListener();
  setTimeout(initializeFirebase, 100);

  await cargarContrasenasDinamicas();
  if (document.getElementById("cardCambiarContrasenas")) {
    mostrarContrasenasEnCard();
  }

  const propinaInput = document.getElementById("calcPropinaInput");
  if (propinaInput) {
    propinaInput.addEventListener("focus", function() {
      if (this.value === "0") this.value = "";
    });
  }

  const turnoSelect = document.getElementById("turnoSelect");
  if (turnoSelect) {
    turnoSelect.value = currentTurno;
    turnoSelect.onchange = function() {
      currentTurno = this.value;
      localStorage.setItem("currentTurno", currentTurno);
    };
  }

  ["salud", "sociales", "ingenieria", "hec_salud"].forEach(tipo => {
    const input = document.getElementById(`passwordInput-${tipo}`);
    if (input) {
      input.addEventListener("keydown", function(e) {
        if (e.key === "Enter") login(tipo);
      });
    }
  });

  const btnEstadisticasLogin = document.getElementById("btnEstadisticasLogin");
  if (btnEstadisticasLogin) {
    btnEstadisticasLogin.onclick = function() {
      document.getElementById("modalEstadisticasAdmin").style.display = "flex";
      document.getElementById("inputPasswordEstadisticas").value = "";
      document.getElementById("msgEstadisticasAdmin").textContent = "";
      setTimeout(() => {
        document.getElementById("inputPasswordEstadisticas").focus();
      }, 100);

      const panel = document.getElementById("menuLateralPanel");
      const overlay = document.getElementById("menuLateralOverlay");
      if (panel && panel.classList.contains("abierto")) {
        panel.classList.remove("abierto");
        document.body.classList.remove("overflow-hidden");
        if (overlay) overlay.style.display = "none";
      }
    };
  }
  const btnConfirmarEstadisticas = document.getElementById("btnConfirmarEstadisticas");
  if (btnConfirmarEstadisticas) {
    btnConfirmarEstadisticas.onclick = async function() {
      const pass = document.getElementById("inputPasswordEstadisticas").value;
      if (!contrasenasDinamicas) await cargarContrasenasDinamicas();
      const passAdmin = contrasenasDinamicas?.admin?.actual || "admin123";
      if (pass === passAdmin) {
        document.getElementById("modalEstadisticasAdmin").style.display = "none";
        mostrarEstadisticasDesdeLogin();
      } else {
        document.getElementById("msgEstadisticasAdmin").textContent = "Contraseña incorrecta";
      }
    };
  }
  const inputPasswordEstadisticas = document.getElementById("inputPasswordEstadisticas");
  if (inputPasswordEstadisticas) {
    inputPasswordEstadisticas.addEventListener("keydown", function(e) {
      if (e.key === "Enter") btnConfirmarEstadisticas.click();
    });
  }

  if (document.getElementById("cardCambiarContrasenas")) {
    mostrarContrasenasEnCard();
  }
});

function initializeFirebase() {
  try {
    console.log("[v0] Intentando inicializar Firebase...")
    console.log("[v0] window.firebaseInitialized disponible:", typeof window.firebaseInitialized !== "undefined")

    if (typeof window.firebaseInitialized !== "undefined" && window.firebaseInitialized) {
      console.log("[v0] Firebase v9+ detectado, inicializando...")
      firebaseApp = window.firebaseApp
      database = window.firebaseDatabase
      isFirebaseEnabled = true
      updateSyncStatus("🟢", "Conectado a Firebase")
      console.log("[v0] Firebase v9+ inicializado correctamente")

      const connectedRef = window.firebaseRef(database, ".info/connected")
      window.firebaseOnValue(connectedRef, (snap) => {
        if (snap.val() === true) {
          console.log("[v0] Conexión a Firebase confirmada")
          updateSyncStatus("🟢", "Conectado a Firebase")
        } else {
          console.log("[v0] Conexión a Firebase perdida")
          updateSyncStatus("🟡", "Reconectando...")
        }
      })
    } else {
      console.warn("[v0] Firebase no disponible, reintentando en 2 segundos...")
      updateSyncStatus("🟡", "Cargando Firebase...")
      setTimeout(initializeFirebase, 2000)
    }
  } catch (error) {
    console.error("[v0] Error inicializando Firebase:", error)
    isFirebaseEnabled = false
    updateSyncStatus("🔴", "Error de conexión")
    setTimeout(initializeFirebase, 3000)
  }
}

function generateDeviceId() {
  deviceId = localStorage.getItem("deviceId")
  if (!deviceId) {
    deviceId = "device_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
    localStorage.setItem("deviceId", deviceId)
  }
  console.log("[v0] Device ID:", deviceId)
}

function updateSyncStatus(icon, title) {
  const syncStatus = document.getElementById("syncStatus")
  if (syncStatus) {
    syncStatus.textContent = icon
    syncStatus.title = title
  }
}

function areLocalDataValid() {
  if (!isFirebaseEnabled || !database || !currentFotocopiado) {
    return true 
  }

  return new Promise((resolve) => {
    const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`)

    window
      .firebaseGet(fotocopiadoRef)
      .then((snapshot) => {
        const firebaseData = snapshot.val()
        if (!firebaseData) {
          resolve(true)
          return
        }

        const localResetTimestamp = calcRegistroVentas.resetTimestamp || 0
        const firebaseResetTimestamp = firebaseData.resetTimestamp || 0

        resolve(firebaseResetTimestamp <= localResetTimestamp)
      })
      .catch(() => {
        resolve(true)
      })
  })
}

function syncToFirebase() {
  if (!isFirebaseEnabled || !database || !currentFotocopiado) {
    console.log("[v0] Firebase no disponible para sincronización")
    return Promise.resolve()
  }

  return areLocalDataValid().then((isValid) => {
    if (!isValid) {
      console.log("[v0] Datos locales obsoletos detectados, cancelando sincronización")
      return calcCargarDatosIniciales()
    }

    return new Promise((resolve, reject) => {
      try {
        const dataToSync = {
          efectivo: calcRegistroVentas.efectivo || 0,
          transferencia: calcRegistroVentas.transferencia || 0,
          ventas: calcRegistroVentas.ventas || [],
          perdidas: calcRegistroVentas.perdidas || [],
          totalPerdidas: calcRegistroVentas.totalPerdidas || 0,
          extras: calcRegistroVentas.extras || [],
          lastUpdated: Date.now(),
          deviceId: deviceId,
          resetTimestamp: calcRegistroVentas.resetTimestamp || 0,
        }

        console.log("[v0] Sincronizando a Firebase:", dataToSync)
        console.log("[v0] Ruta Firebase:", `fotocopiados/${currentFotocopiado}`)

        const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`)
        window
          .firebaseSet(fotocopiadoRef, dataToSync)
          .then(() => {
            updateSyncStatus("🟢", "Sincronizado")
            console.log("[v0] Datos sincronizados a Firebase correctamente")
            calcRegistroVentas.lastUpdated = dataToSync.lastUpdated
            resolve()
          })
          .catch((error) => {
            console.error("[v0] Error sincronizando a Firebase:", error)
            updateSyncStatus("🔴", "Error de sincronización")
            reject(error)
          })
      } catch (error) {
        console.error("[v0] Error sincronizando a Firebase:", error)
        updateSyncStatus("🔴", "Error de sincronización")
        reject(error)
      }
    })
  })
}

function calcCargarDatosIniciales() {
  return new Promise((resolve) => {
    if (!isFirebaseEnabled || !database || !currentFotocopiado) {
      console.log("[v0] Firebase no disponible, cargando desde localStorage")
      calcCargarDatos()
      resolve()
      return
    }

    console.log("[v0] Cargando datos iniciales desde Firebase...")
    updateSyncStatus("🔄", "Cargando datos...")

    const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`)

    window
      .firebaseGet(fotocopiadoRef)
      .then((snapshot) => {
        try {
          const firebaseData = snapshot.val()
          console.log("[v0] Datos de Firebase recibidos:", firebaseData)

          const localData = JSON.parse(localStorage.getItem(`calcRegistroVentas_${currentFotocopiado}`) || "{}")
          const localResetTimestamp = localData.resetTimestamp || 0
          const firebaseResetTimestamp = firebaseData?.resetTimestamp || 0

          if (firebaseData && (firebaseData.ventas || firebaseData.efectivo || firebaseData.transferencia)) {
            if (firebaseResetTimestamp > localResetTimestamp) {
              console.log("[v0] Reset más reciente detectado en Firebase, invalidando datos locales")
              calcRegistroVentas = {
                efectivo: firebaseData.efectivo || 0,
                transferencia: firebaseData.transferencia || 0,
                ventas: firebaseData.ventas || [],
                perdidas: firebaseData.perdidas || [],
                totalPerdidas: firebaseData.totalPerdidas || 0,
                resetTimestamp: firebaseResetTimestamp,
              }
              calcGuardarDatosLocal() 
            } else {
              calcRegistroVentas = {
                efectivo: firebaseData.efectivo || 0,
                transferencia: firebaseData.transferencia || 0,
                ventas: firebaseData.ventas || [],
                resetTimestamp: firebaseResetTimestamp,
              }
              calcGuardarDatosLocal()
            }

            console.log("[v0] Datos cargados desde Firebase:", calcRegistroVentas)
            updateSyncStatus("🟢", "Datos sincronizados desde Firebase")
          } else {
            console.log("[v0] No hay datos en Firebase, cargando desde localStorage")
            calcCargarDatos()

            if (calcRegistroVentas.ventas.length > 0) {
              console.log("[v0] Sincronizando datos locales a Firebase")
              syncToFirebase()
            }
          }
          resolve()
        } catch (error) {
          console.error("[v0] Error cargando desde Firebase:", error)
          calcCargarDatos() 
          updateSyncStatus("🔴", "Error cargando datos")
          resolve()
        }
      })
      .catch((error) => {
        console.error("[v0] Error accediendo a Firebase:", error)
        calcCargarDatos() 
        updateSyncStatus("🔴", "Error de conexión")
        resolve()
      })
  })
}

function calcGuardarDatosLocal() {
  if (!currentFotocopiado) return
  localStorage.setItem(`calcRegistroVentas_${currentFotocopiado}`, JSON.stringify(calcRegistroVentas))
}

function calcGuardarDatos() {
  if (!currentFotocopiado) return

  calcRegistroVentas.lastUpdated = Date.now()
  calcGuardarDatosLocal()

  console.log("[v0] Guardando datos y sincronizando...")
  syncToFirebase().catch((error) => {
    console.error("[v0] Error en sincronización:", error)
  })
}

function calcAgregarArchivo() {
  calcContadorArchivos++;
  const container = document.getElementById("calcArchivosContainer");
  const div = document.createElement("div");
  div.className = "calc-card calc-archivo animated-fadeInUp animating";
  div.id = `calcArchivo${calcContadorArchivos}`;

  const numeroArchivo = calcArchivos.length + 1;

  div.innerHTML = `
    <div class="calc-card-content">
        <div class="calc-flex-between" style="margin-bottom: 24px; align-items: flex-start;">
            <div style="font-size: 1.2rem; font-weight: 600; color: var(--text-heading);">
                Archivo ${numeroArchivo}
            </div>
            <button onclick="calcEliminarArchivo(${calcContadorArchivos})" class="calc-btn calc-btn-danger" style="margin-left: 0; padding: 6px 12px; font-size: 0.9rem;">
                Eliminar
            </button>
        </div>
        <div class="calc-archivo-form">
            <div class="calc-archivo-row">
                <div>
                    <label class="calc-label">Páginas</label>
                    <input type="number" id="calcPaginas${calcContadorArchivos}" value="1" min="1" 
                        class="calc-input" 
                        onchange="calcActualizarSubtotal(${calcContadorArchivos})"
                        onfocus="if(this.value==='1'){this.value='';}"
                        onblur="if(this.value===''){this.value='1';calcActualizarSubtotal(${calcContadorArchivos});}">
                </div>
                <div>
                    <label class="calc-label">Copias</label>
                    <input type="number" id="calcCopias${calcContadorArchivos}" value="1" min="1"
                        class="calc-input" 
                        onchange="calcActualizarSubtotal(${calcContadorArchivos})"
                        onfocus="if(this.value==='1'){this.value='';}"
                        onblur="if(this.value===''){this.value='1';calcActualizarSubtotal(${calcContadorArchivos});}">
                </div>
            </div>
            <div class="calc-archivo-ajustes">
                <label class="calc-label">Ajustes</label>
                <select id="calcTipo${calcContadorArchivos}" class="calc-select" onchange="calcActualizarSubtotal(${calcContadorArchivos})">
                    <option value="1">Simple/Doble faz</option>
                    <option value="2">Doble faz (2 pág/carilla)</option>
                    <option value="4">Doble faz (4 pág/carilla)</option>
                    <option value="6">Doble faz (6 pág/carilla)</option>
                    <option value="9">Doble faz (9 pág/carilla)</option>
                </select>
            </div>
            <div class="calc-archivo-tipo">
                <label class="calc-label">Tipo de impresion</label>
                <select id="calcColor${calcContadorArchivos}" class="calc-select" onchange="calcActualizarSubtotal(${calcContadorArchivos})">
                    <option value="bn">Blanco y Negro</option>
                    <option value="color">Color</option>
                </select>
            </div>
            <div class="calc-archivo-resumen" id="calcDesc${calcContadorArchivos}" style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 4px;">
                1 hojas × 1 copias
            </div>
            <div class="calc-precio-container">
                <div class="calc-badge calc-badge-large" id="calcSubtotal${calcContadorArchivos}">
                    $40
                </div>
            </div>
        </div>
    </div>
  `;

  container.appendChild(div);

  setTimeout(() => {
    div.classList.remove("animated-fadeInUp", "animating");
  }, 400);

  calcArchivos.push({
    id: calcContadorArchivos,
    paginas: 1,
    copias: 1,
    tipo: "1",
    color: "bn",
  });
  const propinaInput = document.getElementById("calcPropinaInput");
  if (propinaInput) propinaInput.value = "0";

  calcActualizarSubtotal(calcContadorArchivos);
}

function calcEliminarArchivo(id) {
  if (calcArchivos.length <= 1) {
    showSyncNotification("Debe haber al menos un archivo para realizar la venta.");
    return;
  }
  const div = document.getElementById(`calcArchivo${id}`);
  if (div) {
    div.classList.add("animated-fadeOutDown", "animating");
    setTimeout(() => {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, 400);
  }

  calcArchivos = calcArchivos.filter(a => a.id !== id);

  calcReorganizarNombresArchivos();
}

function calcReorganizarNombresArchivos() {
  const container = document.getElementById("calcArchivosContainer")
  const tarjetas = container.querySelectorAll(".calc-card.calc-archivo")

  tarjetas.forEach((tarjeta, index) => {
    const numeroNuevo = index + 1
    const titulo = tarjeta.querySelector('div[style*="font-size: 1.2rem"]')
    if (titulo) {
      const botonEliminar = titulo.querySelector("button")
      const textoBoton = botonEliminar ? botonEliminar.outerHTML : ""
      titulo.innerHTML = `Archivo ${numeroNuevo} ${textoBoton}`
    }
  })
}

function calcActualizarSubtotal(numeroArchivo) {
  const precioHojaBN = Number.parseFloat(document.getElementById("calcPrecioHoja").value) || 0
  const precioHojaColor = Number.parseFloat(document.getElementById("calcPrecioHojaColor").value) || 0
  const paginas = Number.parseInt(document.getElementById(`calcPaginas${numeroArchivo}`).value) || 0
  const copias = Number.parseInt(document.getElementById(`calcCopias${numeroArchivo}`).value) || 1
  const tipo = document.getElementById(`calcTipo${numeroArchivo}`).value
  const color = document.getElementById(`calcColor${numeroArchivo}`).value

  if (paginas <= 0) {
    const descElement = document.getElementById(`calcDesc${numeroArchivo}`)
    const subtotalElement = document.getElementById(`calcSubtotal${numeroArchivo}`)
    if (descElement && subtotalElement) {
      descElement.textContent = "Error: Debe ingresar más de 0 páginas."
      subtotalElement.textContent = "$0"
    }
    return
  }

  const archivoIndex = calcArchivos.findIndex((a) => a.id === numeroArchivo)
  if (archivoIndex !== -1) {
    calcArchivos[archivoIndex] = { id: numeroArchivo, paginas, copias, tipo, color }
  }

  const paginasPorCarilla = Number.parseInt(tipo) || 1
  const hojasNecesarias = Math.ceil(paginas / paginasPorCarilla)
  const precioHoja = color === "color" ? precioHojaColor : precioHojaBN
  const subtotal = hojasNecesarias * precioHoja * copias

  const descElement = document.getElementById(`calcDesc${numeroArchivo}`)
  const subtotalElement = document.getElementById(`calcSubtotal${numeroArchivo}`)

  if (descElement && subtotalElement) {
    descElement.textContent = `${hojasNecesarias} hojas × ${copias} copias`
    subtotalElement.textContent = `$${subtotal.toLocaleString("es-AR")}`
  }
}

function calcCalcularTotal() {
  const precioHojaBN = Number.parseFloat(document.getElementById("calcPrecioHoja").value)
  const precioHojaColor = Number.parseFloat(document.getElementById("calcPrecioHojaColor").value)

  if (calcArchivos.length === 0) {
    alert("Agrega al menos un archivo.")
    return
  }

  if (!precioHojaBN || precioHojaBN <= 0 || !precioHojaColor || precioHojaColor <= 0) {
    alert("Ingresa precios válidos para las hojas.")
    return
  }

  let totalCalculado = 0

  calcArchivos.forEach((archivo) => {
    const paginasPorCarilla = Number.parseInt(archivo.tipo) || 1;
    const hojasNecesarias = Math.ceil(archivo.paginas / paginasPorCarilla);
    const precioHoja = archivo.color === "color" ? precioHojaColor : precioHojaBN;
    totalCalculado += hojasNecesarias * precioHoja * archivo.copias;
  })

  calcTotal = totalCalculado
  const propinaInput = document.getElementById("calcPropinaInput")
  const propinaLabel = document.getElementById("calcPropinaLabel")
  let propina = 0
  if (propinaInput) {
    propinaInput.style.display = "block"
    propina = Number.parseFloat(propinaInput.value) || 0
  }
  if (propinaLabel) propinaLabel.style.display = "block"
  document.getElementById("calcTotalDisplay").textContent = `Total a cobrar: $${(calcTotal + propina).toLocaleString("es-AR")}${propina > 0 ? ` (Propina: $${propina})` : ""}`
  document.getElementById("calcPagoContainer").style.display = "block"

  calcMetodoPago = null
  document.getElementById("calcEfectivo").checked = false
  document.getElementById("calcTransferencia").checked = false
  document.getElementById("calcDividido").checked = false;
  document.getElementById("calcDineroCliente").value = ""
  document.getElementById("calcResultadoCambio").style.display = "none"
  document.getElementById("calcBtnFinalizar").disabled = true

  document.getElementById("calcDivididoEfectivo").value = "";
  document.getElementById("calcDivididoTransferencia").value = "";
  document.getElementById("calcDivididoError").textContent = "";

  document.getElementById("calcPagoContainer").scrollIntoView({ behavior: "smooth" })

  if (propinaInput) {
    propinaInput.oninput = function() {
      const nuevaPropina = Number.parseFloat(this.value) || 0
      document.getElementById("calcTotalDisplay").textContent = `Total a cobrar: $${(calcTotal + nuevaPropina).toLocaleString("es-AR")}${nuevaPropina > 0 ? ` (Propina: $${nuevaPropina})` : ""}`
    }
  }
}

function calcCancelarVenta() {
  if (confirm("¿Estás seguro de que quieres cancelar la venta actual? Se perderán todos los archivos agregados.")) {
    document.getElementById("calcArchivosContainer").innerHTML = ""
    document.getElementById("calcPagoContainer").style.display = "none"
    calcArchivos = []
    calcContadorArchivos = 0
    calcTotal = 0
    calcMetodoPago = null

    document.getElementById("calcDivididoEfectivo").value = "";
    document.getElementById("calcDivididoTransferencia").value = "";
    document.getElementById("calcDivididoError").textContent = "";

    calcAgregarArchivo()
    window.scrollTo({ top: 0, behavior: "smooth" })
  }
}

function calcSeleccionarMetodo(metodo) {
    const efectivoCheck = document.getElementById("calcEfectivo");
    const transferenciaCheck = document.getElementById("calcTransferencia");
    const divididoCheck = document.getElementById("calcDividido");
    const btnFinalizar = document.getElementById("calcBtnFinalizar");
    const divididoInputs = document.getElementById("calcDivididoInputs");
    if (metodo === "efectivo") {
        calcMetodoPago = efectivoCheck.checked ? "efectivo" : null;
        transferenciaCheck.checked = false;
        divididoCheck.checked = false;
        divididoInputs.style.display = "none";
        btnFinalizar.disabled = !efectivoCheck.checked;
    } else if (metodo === "transferencia") {
        calcMetodoPago = transferenciaCheck.checked ? "transferencia" : null;
        efectivoCheck.checked = false;
        divididoCheck.checked = false;
        divididoInputs.style.display = "none";
        btnFinalizar.disabled = !transferenciaCheck.checked;
    } else if (metodo === "dividido") {
        if (divididoCheck.checked) {
            calcMetodoPago = "dividido";
            efectivoCheck.checked = false;
            transferenciaCheck.checked = false;
            divididoInputs.style.display = "flex";
            btnFinalizar.disabled = true;
            document.getElementById("calcDivididoEfectivo").value = "";
            document.getElementById("calcDivididoTransferencia").value = "";
            document.getElementById("calcDivididoError").textContent = "";
            ["calcDivididoEfectivo", "calcDivididoTransferencia"].forEach(id => {
                document.getElementById(id).oninput = function() {
                    const efectivo = Number(document.getElementById("calcDivididoEfectivo").value) || 0;
                    const transferencia = Number(document.getElementById("calcDivididoTransferencia").value) || 0;
                    const total = calcTotal + (Number(document.getElementById("calcPropinaInput").value) || 0);
                    if (efectivo + transferencia === total) {
                        btnFinalizar.disabled = false;
                        document.getElementById("calcDivididoError").textContent = "";
                    } else {
                        btnFinalizar.disabled = true;
                        document.getElementById("calcDivididoError").textContent = "La suma debe ser igual al total.";
                    }
                };
            });
        } else {
            calcMetodoPago = null;
            divididoInputs.style.display = "none";
            btnFinalizar.disabled = true;
        }
    }
}

function calcCalcularCambio() {
  const dinero = Number.parseFloat(document.getElementById("calcDineroCliente").value)
  const resultado = document.getElementById("calcResultadoCambio")

  if (!dinero || dinero < 0) {
    alert("Ingresa una cantidad válida de dinero.")
    return
  }

  resultado.style.display = "block"
  const cambio = dinero - calcTotal

  if (cambio < 0) {
    resultado.innerHTML = `
            <div style="text-align: center; padding: 20px; background: #fef2f2; border: 2px solid #fca5a5; border-radius: 8px; color: #dc2626;">
                <div style="font-size: 1.2rem; font-weight: 600;">Falta dinero: $${Math.abs(cambio)}</div>
            </div>
        `
  } else {
    resultado.innerHTML = `
            <div style="text-align: center; padding: 20px; background: #f0fdf4; border: 2px solid #86efac; border-radius: 8px;">
                <div style="font-size: 1.2rem; font-weight: 600; color: #059669;">
                    Cambio a devolver: $${cambio}
                </div>
            </div>
        `
  }
}

function calcFinalizarVenta() {
    if (!calcMetodoPago) {
        alert("Por favor selecciona un método de pago.");
        return;
    }
    const ahora = new Date();
    const propina = Number.parseFloat(document.getElementById("calcPropinaInput")?.value) || 0;
    let ventaDetalle = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        fecha: ahora.toLocaleDateString("es-ES"),
        hora: ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
        total: calcTotal + propina,
        propina: propina,
        archivos: [...calcArchivos],
        precioHojaBN: Number.parseFloat(document.getElementById("calcPrecioHoja").value),
        precioHojaColor: Number.parseFloat(document.getElementById("calcPrecioHojaColor").value),
        deviceId: deviceId,
        timestamp: Date.now(),
    };
    if (calcMetodoPago === "efectivo") {
        ventaDetalle.metodoPago = "efectivo";
        calcRegistroVentas.efectivo += ventaDetalle.total;
    } else if (calcMetodoPago === "transferencia") {
        ventaDetalle.metodoPago = "transferencia";
        calcRegistroVentas.transferencia += ventaDetalle.total;
    } else if (calcMetodoPago === "dividido") {
        ventaDetalle.metodoPago = "dividido";
        ventaDetalle.dividido = {
            efectivo: Number(document.getElementById("calcDivididoEfectivo").value) || 0,
            transferencia: Number(document.getElementById("calcDivididoTransferencia").value) || 0
        };
        calcRegistroVentas.dividido = (calcRegistroVentas.dividido || 0) + ventaDetalle.dividido.efectivo + ventaDetalle.dividido.transferencia;
        calcRegistroVentas.efectivo += ventaDetalle.dividido.efectivo;
        calcRegistroVentas.transferencia += ventaDetalle.dividido.transferencia;
    }
    calcRegistroVentas.ventas.push(ventaDetalle);
    calcGuardarDatos();
    if (typeof calcActualizarTabla === "function") {
        calcActualizarTabla();
    }
    document.getElementById("calcArchivosContainer").innerHTML = "";
    document.getElementById("calcPagoContainer").style.display = "none";
    calcArchivos = [];
    calcContadorArchivos = 0;
    calcTotal = 0;
    calcMetodoPago = null;
    if (document.getElementById("calcPropinaInput")) document.getElementById("calcPropinaInput").value = "0";

    document.getElementById("calcDivididoEfectivo").value = "";
    document.getElementById("calcDivididoTransferencia").value = "";
    document.getElementById("calcDivididoError").textContent = "";

    calcAgregarArchivo();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function calcRestablecerVentas() {
  const password = prompt("Ingresa la contraseña de administrador para restablecer las ventas:");
  if (password === null || password === "") return;
  if (!contrasenasDinamicas) await cargarContrasenasDinamicas();
  const passAdmin = contrasenasDinamicas?.admin || "admin123";
  if (password !== passAdmin) {
    alert("Contraseña incorrecta. No se puede restablecer el registro de ventas.");
    return;
  }

  if (isFirebaseEnabled && database && currentFotocopiado) {
    try {
      const ventasRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`);
      const backupRef = window.firebaseRef(database, `backups/${currentFotocopiado}/${Date.now()}`);
      const snapshot = await window.firebaseGet(ventasRef);
      if (snapshot.exists()) {
        await window.firebaseSet(backupRef, snapshot.val());
      }

      const ahora = new Date();
      const añoMes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
      const turno = currentTurno || "TM";
      const historicoRef = window.firebaseRef(
        database,
        `historicos/${currentFotocopiado}/${añoMes}/${turno}/${Date.now()}`
      );
      const resumen = {
        ...snapshot.val(),
        fecha: ahora.toLocaleDateString("es-ES"),
        turno: turno,
        timestamp: Date.now(),
      };
      await window.firebaseSet(historicoRef, resumen);
    } catch (error) {
      console.error("Error guardando backup/histórico en Firebase:", error);
    }
  }

  if (confirm("¿Estás seguro de que deseas restablecer todas las ventas del día?")) {
    const resetTimestamp = Date.now();
    calcRegistroVentas = {
      efectivo: 0,
      transferencia: 0,
      ventas: [],
      resetTimestamp: resetTimestamp,
      isReset: true,
    };
    calcGuardarDatosLocal();
    calcActualizarTabla();

    if (isFirebaseEnabled && database && currentFotocopiado) {
      const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`);
      const resetData = {
        efectivo: 0,
        transferencia: 0,
        ventas: [],
        resetTimestamp: resetTimestamp,
        isReset: true,
        lastUpdated: resetTimestamp,
        deviceId: deviceId,
      };
      window.firebaseSet(fotocopiadoRef, resetData)
        .then(() => {
          updateSyncStatus("🟢", "Ventas restablecidas y sincronizadas");
        })
        .catch((error) => {
          console.error("Error sincronizando reset:", error);
        });
    }
  }
}

async function calcMostrarComparativa() {
  const calculatorScreen = document.getElementById("calculatorScreen");
  const comparativaScreen = document.getElementById("calcComparativaScreen");
  calculatorScreen.classList.add("animated-fadeOutDown", "animating");
  setTimeout(() => {
    calculatorScreen.style.display = "none";
    calculatorScreen.classList.remove("animated-fadeOutDown", "animating");
    comparativaScreen.style.display = "block";
    comparativaScreen.classList.add("animated-fadeInUp");
    setTimeout(() => {
      comparativaScreen.classList.remove("animated-fadeInUp");
    }, 500);

    const cardImpresoras = document.getElementById("panelRegistroImpresoras");
    if (cardImpresoras) {
      cardImpresoras.style.display = "block";
      const filtroFecha = document.getElementById("filtroFechaImpresoras");
      const filtroCopiado = document.getElementById("filtroCopiadoImpresoras");
      const filtroTurno = document.getElementById("filtroTurnoImpresoras");
      const hoy = new Date();
      if (filtroFecha) filtroFecha.value = hoy.toISOString().slice(0, 10);
      if (filtroCopiado) filtroCopiado.value = "salud";
      if (filtroTurno) filtroTurno.value = "TM";
      if (filtroFecha && filtroCopiado && filtroTurno) {
        mostrarRegistrosImpresoras(filtroFecha.value, filtroCopiado.value, filtroTurno.value);
      }
    }
  }, 400);

  const themeTextComp = document.getElementById("themeTextComp")
  const currentTheme = document.documentElement.getAttribute("data-theme")
  if (themeTextComp) {
    themeTextComp.textContent = currentTheme === "dark" ? "☀️ Claro" : "🌙 Oscuro"
  }

  await calcCargarDatosComparativa();

  if (typeof mostrarReportesPanelControl === "function") {
    mostrarReportesPanelControl();
  }
}

function calcVolverDesdeComparativa() {
  const calculatorScreen = document.getElementById("calculatorScreen");
  const comparativaScreen = document.getElementById("calcComparativaScreen");
  const cardImpresoras = document.getElementById("panelRegistroImpresoras");
  comparativaScreen.classList.add("animated-fadeOutDown", "animating");
  setTimeout(() => {
    comparativaScreen.style.display = "none";
    comparativaScreen.classList.remove("animated-fadeOutDown", "animating");
    if (cardImpresoras) cardImpresoras.style.display = "none";
    if (cameFromLogin) {
      document.getElementById("loginScreen").style.display = "flex";
      cameFromLogin = false;
      const btnMenu = document.getElementById("btnMenuHamburguesa");
      if (btnMenu) btnMenu.classList.remove("oculto");
    } else {
      calculatorScreen.style.display = "block";
      calculatorScreen.classList.add("animated-fadeInUp");
      setTimeout(() => {
        calculatorScreen.classList.remove("animated-fadeInUp");
      }, 500);
    }
  }, 400);

  if (document.getElementById("calculatorScreen").style.display === "block") {
    document.getElementById("turnoSelectorFixed").style.display = "flex";
  }
}

async function calcCargarDatosComparativa() {
  if (!isFirebaseEnabled || !database) {
    alert("Firebase no está disponible. No se pueden cargar los datos de comparativa.")
    return
  }

  try {
    const institutos = ["salud", "sociales", "ingenieria", "hec_salud"];
    const datosInstitutos = {}

    for (const instituto of institutos) {
      const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${instituto}`)
      const snapshot = await window.firebaseGet(fotocopiadoRef)
      const data = snapshot.exists() ? snapshot.val() : {}

      datosInstitutos[instituto] = {
        name: calcInstitutos[instituto].name,
        efectivo: data?.efectivo || 0,
        transferencia: data?.transferencia || 0,
        ventas: data?.ventas || [],
        total: (data?.efectivo || 0) + (data?.transferencia || 0),
        perdidas: (data?.perdidas || []).length,
        totalPerdidas: data?.totalPerdidas || 0,
        extras: data?.extras || []
      }
    }

    calcMostrarDatosComparativa(datosInstitutos)
  } catch (error) {
    console.error("Error cargando datos de comparativa:", error)
    alert("Error al cargar los datos de comparativa")
  }
}

function calcMostrarDatosComparativa(datos) {
  let totalGeneral = 0
  let ventasTotales = 0
  let institutoLider = ""
  let maxTotal = 0

  Object.values(datos).forEach((instituto) => {
    totalGeneral += instituto.total
    ventasTotales += instituto.ventas.length
    if (instituto.total > maxTotal) {
      maxTotal = instituto.total
      institutoLider = instituto.name
    }
  })

  document.getElementById("calcTotalGeneralComp").textContent = `$${totalGeneral.toLocaleString("es-AR")}`
  document.getElementById("calcInstitutoLider").textContent = institutoLider || "Sin datos"
  document.getElementById("calcVentasTotales").textContent = ventasTotales

  calcCrearGraficoIngresos(datos)
  calcCrearGraficoMetodos(datos)

  const grid = document.getElementById("calcDetallesGrid")
  grid.innerHTML = ""

  const colores = [
    "#22c55e",
    "#3b82f6",
    "#f55757ff",
    "#fb923c",
  ]

  Object.entries(datos).forEach(([key, instituto], idx) => {
    const ventasDividido = (instituto.ventas || []).filter(v => v.metodoPago === "dividido");
    const totalDividido = ventasDividido.reduce((acc, v) => acc + ((v.dividido?.efectivo || 0) + (v.dividido?.transferencia || 0)), 0);

    const card = document.createElement("div")
    card.className = "calc-detail-card"
    card.style.position = "relative"
    card.tabIndex = 0
    card.setAttribute("role", "button")
    card.setAttribute("title", `Ir al registro de ${instituto.name}`)
    card.onclick = (e) => { window.irAlRegistroCopiado(key) }
    card.onkeydown = (e) => { if (e.key === "Enter") window.irAlRegistroCopiado(key) }
    card.innerHTML = `
  <button class="calc-btn btn-ir-copiado" style="position:absolute;top:14px;right:14px;width:25px;height:25px;min-width:35px;min-height:35px;max-width:44px;max-height:44px;display:flex;align-items:center;justify-content:center;padding:0;background:var(--bg-card);border:1.5px solid var(--border-color);transition:background 0.18s,border 0.18s;" title="Ir al registro de ${instituto.name}" tabindex="0" onclick="event.stopPropagation();window.irAlRegistroCopiado('${key}')">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:auto;">
      <path d="M7 17L17 7"/>
      <polyline points="8 7 17 7 17 16"/>
    </svg>
  </button>
  <h4 style="color:${colores[idx]};text-transform:uppercase;font-weight:800;">${instituto.name.toUpperCase()}</h4>
  <div class="calc-detail-stat">
      <span>Total de Ingresos:</span>
      <span>$${instituto.total.toLocaleString("es-AR")}</span>
  </div>
  <div class="calc-detail-stat">
      <span>Ventas en Efectivo:</span>
      <span>$${instituto.efectivo.toLocaleString("es-AR")}</span>
  </div>
  <div class="calc-detail-stat">
      <span>Ventas por Transferencia:</span>
      <span>$${instituto.transferencia.toLocaleString("es-AR")}</span>
  </div>
  <div class="calc-detail-stat">
      <span>Pagos divididos:</span>
      <span>$${totalDividido.toLocaleString("es-AR")}</span>
  </div>
  <div class="calc-detail-stat">
      <span>Número de Ventas:</span>
      <span>${instituto.ventas.length}</span>
  </div>
  <div class="calc-detail-stat">
      <span>Promedio por Venta:</span>
      <span>$${instituto.ventas.length > 0 ? Math.round(instituto.total / instituto.ventas.length).toLocaleString("es-AR") : 0}</span>
  </div>
  <div class="calc-detail-stat">
      <span>Pérdidas:</span>
      <span>${instituto.perdidas} ($${instituto.totalPerdidas.toLocaleString("es-AR")})</span>
  </div>
  <div class="calc-detail-stat">
      <span>Extras:</span>
      <span>${instituto.extras?.length || 0} ($${instituto.extras?.reduce((acc, e) => acc + (e.precio || 0), 0).toLocaleString("es-AR")})</span>
  </div>
    `
    grid.appendChild(card)
  })

  let explicacion = document.getElementById("calcDetallesGridExplicacion")
  if (!explicacion) {
    explicacion = document.createElement("div")
    explicacion.id = "calcDetallesGridExplicacion"
    explicacion.style.cssText = "margin-top:10px;font-size:0.93rem;color:var(--text-secondary);text-align:center;opacity:0.85;"
    grid.parentNode.appendChild(explicacion)
  }
  explicacion.innerHTML = `<em>Al darle click a cualquiera de las tarjetas de los copiados, o al icono <span style="font-size:1.1em;">↗</span> en la esquina, se puede acceder al registro del fotocopiado seleccionado.</em>`
}

function calcCrearGraficoIngresos(datos) {
  const ctx = document.getElementById("calcChartIngresos").getContext("2d")

  if (comparativaCharts.ingresos) {
    comparativaCharts.ingresos.destroy()
  }

  const labels = Object.values(datos).map((d) => d.name)
  const totales = Object.values(datos).map((d) => d.total)

  comparativaCharts.ingresos = new window.Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Ingresos Totales",
          data: totales,
          backgroundColor: [
            "rgba(34, 197, 94, 0.8)",
            "rgba(59, 130, 246, 0.8)",
            "rgba(239, 68, 68, 0.8)",
            "rgba(251, 146, 60, 0.85)",
          ],
          borderColor: [
            "rgba(34, 197, 94, 1)",
            "rgba(59, 130, 246, 1)",
            "rgba(239, 68, 68, 1)",
            "rgba(251, 146, 60, 1)",
          ],
          borderWidth: 2,
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => "$" + value.toLocaleString(),
          },
        },
      },
    },
  })
}

function calcCrearGraficoMetodos(datos) {
  const ctx = document.getElementById("calcChartMetodos").getContext("2d")

  if (comparativaCharts.metodos) {
    comparativaCharts.metodos.destroy()
  }

  const labels = Object.values(datos).map((d) => d.name)
  const efectivo = Object.values(datos).map((d) => d.efectivo)
  const transferencia = Object.values(datos).map((d) => d.transferencia)

  comparativaCharts.metodos = new window.Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Efectivo",
          data: efectivo,
          backgroundColor: "rgba(34, 197, 94, 0.8)",
          borderColor: "rgba(34, 197, 94, 1)",
          borderWidth: 2,
          borderRadius: 8,
        },
        {
          label: "Transferencia",
          data: transferencia,
          backgroundColor: "rgba(59, 130, 246, 0.8)",
          borderColor: "rgba(59, 130, 246, 1)",
          borderWidth: 2,
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: false,
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => "$" + value.toLocaleString(),
          },
        },
      },
      plugins: {
        legend: {
          position: "top",
        },
      },
    },
  })
}

function calcMostrarDetallesComparativa(datos) {
  const grid = document.getElementById("calcDetallesGrid")
  grid.innerHTML = ""

  Object.entries(datos).forEach(([key, instituto]) => {
    const card = document.createElement("div")
    card.className = "calc-detail-card"
    card.innerHTML = `
      <h4>${instituto.name}</h4>
      <div class="calc-detail-stat">
          <span>Total de Ingresos:</span>
          <span>$${instituto.total.toLocaleString("es-AR")}</span>
      </div>
      <div class="calc-detail-stat">
          <span>Ventas en Efectivo:</span>
          <span>$${instituto.efectivo.toLocaleString("es-AR")}</span>
      </div>
      <div class="calc-detail-stat">
          <span>Ventas por Transferencia:</span>
          <span>$${instituto.transferencia.toLocaleString("es-AR")}</span>
      </div>
      <div class="calc-detail-stat">
          <span>Número de Ventas:</span>
          <span>${instituto.ventas.length}</span>
      </div>
      <div class="calc-detail-stat">
          <span>Promedio por Venta:</span>
          <span>$${instituto.ventas.length > 0 ? Math.round(instituto.total / instituto.ventas.length).toLocaleString("es-AR") : 0}</span>
      </div>
      <div class="calc-detail-stat">
          <span>Pérdidas:</span>
          <span>${instituto.perdidas} ($${instituto.totalPerdidas.toLocaleString("es-AR")})</span>
      </div>
      <div class="calc-detail-stat">
          <span>Extras:</span>
          <span>${instituto.extras?.length || 0} ($${instituto.extras?.reduce((acc, e) => acc + (e.precio || 0), 0).toLocaleString("es-AR")})</span>
      </div>
    `
    grid.appendChild(card)
  })
}


function abrirCompararMesesFacturacion() {
  if (!isFirebaseEnabled || !database) {
    alert("Firebase no está disponible. Espera unos segundos e intenta de nuevo.");
    return;
  }
  let modal = document.getElementById("modalCompararMesesFacturacion");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modalCompararMesesFacturacion";
    modal.style.cssText = `
      position:fixed;z-index:4000;top:0;left:0;width:100vw;height:100vh;
      background:rgba(30,41,59,0.45);backdrop-filter:blur(2px);
      display:flex;align-items:center;justify-content:center;
    `;
    modal.innerHTML = `
      <div class="modal-comparar-meses-horizontal">
        <div class="modal-comparar-meses-col selector">
          <h2>Comparar facturación por meses</h2>
          <div id="contenedorSelectorMeses"></div>
          <div style="margin:18px 0;">
            <button class="calc-btn calc-btn-primary" onclick="compararFacturacionMeses()">Comparar</button>
            <button class="calc-btn calc-btn-secondary" onclick="cerrarModalCompararMesesFacturacion()">Cerrar</button>
          </div>
        </div>
        <div class="modal-comparar-meses-col resultados">
          <div id="resultadoCompararMeses"></div>
          <canvas id="graficoFacturacionMeses" style="margin-top:20px;max-width:100%;"></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.body.classList.add("overflow-hidden");
    cargarOpcionesMesesFacturacion();
  } else {
    modal.style.display = "flex";
    cargarOpcionesMesesFacturacion();
  }
}

function cerrarModalCompararMesesFacturacion() {
  const modal = document.getElementById("modalCompararMesesFacturacion");
  if (modal) modal.style.display = "none";
  document.body.classList.remove("overflow-hidden");
}

async function cargarOpcionesMesesFacturacion() {
  const cont = document.getElementById("contenedorSelectorMeses");
  cont.innerHTML = "Cargando meses...";
  if (!isFirebaseEnabled || !database) {
    cont.innerHTML = "Firebase no disponible.";
    return;
  }
  const institutos = ["salud", "sociales", "ingenieria"];
  let mesesSet = new Set();
  for (const tipo of institutos) {
    const historicosRef = window.firebaseRef(database, `historicos/${tipo}`);
    const snap = await window.firebaseGet(historicosRef);
    if (snap.exists()) {
      Object.keys(snap.val()).forEach(mes => mesesSet.add(mes));
    }
  }
  const meses = Array.from(mesesSet).sort().reverse();
  if (meses.length === 0) {
    cont.innerHTML = "No hay meses históricos disponibles.";
    return;
  }

  let selectedMeses = [];
  if (meses.length >= 2) {
    selectedMeses = [meses[0], meses[1]];
  } else {
    selectedMeses = [meses[0]];
  }

  cont.innerHTML = `
    <label style="font-weight:600;">Selecciona los meses:</label>
    <select id="selectorMesesFacturacion" multiple size="6" style="width:100%;margin-top:8px;padding:8px 4px;">
      ${meses.map(m => `<option value="${m}"${selectedMeses.includes(m) ? " selected" : ""}>${formatearMes(m)}</option>`).join("")}
    </select>
    <div style="font-size:0.92rem;color:var(--text-secondary);margin-top:6px;">(Ctrl/Cmd + clic para seleccionar varios)</div>
  `;

  setTimeout(compararFacturacionMeses, 100);

  const selector = document.getElementById("selectorMesesFacturacion");
  if (selector) {
    selector.addEventListener("change", compararFacturacionMeses);
  }
}

function formatearMes(mesStr) {
  const [anio, mes] = mesStr.split("-");
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return `${meses[parseInt(mes,10)-1]} ${anio}`;
}

let chartFacturacionMeses = null;
async function compararFacturacionMeses() {
  const select = document.getElementById("selectorMesesFacturacion");
  if (!select) return;
  const seleccionados = Array.from(select.selectedOptions).map(opt => opt.value);
  const resultadoDiv = document.getElementById("resultadoCompararMeses");
  const canvas = document.getElementById("graficoFacturacionMeses");
  resultadoDiv.innerHTML = "Cargando...";

  if (!isFirebaseEnabled || !database) {
    resultadoDiv.innerHTML = "Firebase no disponible.";
    return;
  }
  if (seleccionados.length === 0) {
    resultadoDiv.innerHTML = "Selecciona al menos un mes.";
    if (chartFacturacionMeses) chartFacturacionMeses.destroy();
    return;
  }

  const institutos = ["salud", "sociales", "ingenieria"];
  const datosPorMes = {};
  for (const mes of seleccionados) {
    let total = 0;
    for (const tipo of institutos) {
      const historicosRef = window.firebaseRef(database, `historicos/${tipo}/${mes}`);
      const snap = await window.firebaseGet(historicosRef);
      if (snap.exists()) {
        const turnos = snap.val();
        for (const turno in turnos) {
          for (const key in turnos[turno]) {
            const h = turnos[turno][key];
            total += (h.efectivo || 0) + (h.transferencia || 0);
          }
        }
      }
    }
    datosPorMes[mes] = total;
  }

  let mayorMes = null, mayorValor = -1;
  let tabla = `<table style="width:100%;margin-top:10px;"><thead><tr><th>Mes</th><th>Total Facturado</th></tr></thead><tbody>`;
  seleccionados.forEach(mes => {
    const total = datosPorMes[mes] || 0;
    if (total > mayorValor) {
      mayorValor = total;
      mayorMes = mes;
    }
    tabla += `<tr${total === mayorValor ? ' style="background:#d1fae5;font-weight:700;"' : ""}><td>${formatearMes(mes)}</td><td class="total-facturado">$${total.toLocaleString("es-AR")}</td></tr>`;
  });
  tabla += `</tbody></table>`;
  tabla += `<div style="margin-top:10px;font-weight:600;">Mes con mayor facturación: <span class="mes-mayor">${formatearMes(mayorMes)} ($${mayorValor.toLocaleString("es-AR")})</span></div>`;
  resultadoDiv.innerHTML = tabla;

  const labels = seleccionados.map(formatearMes);
  const valores = seleccionados.map(mes => datosPorMes[mes] || 0);
  const ctx = canvas.getContext("2d");
  if (chartFacturacionMeses) chartFacturacionMeses.destroy();
  chartFacturacionMeses = new window.Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Facturación total",
        data: valores,
        backgroundColor: labels.map((_, i) => valores[i] === mayorValor ? "rgba(16,185,129,0.8)" : "rgba(59,130,246,0.7)"),
        borderColor: labels.map((_, i) => valores[i] === mayorValor ? "rgba(16,185,129,1)" : "rgba(59,130,246,1)"),
        borderWidth: 2,
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => "$" + v.toLocaleString("es-AR") }
        }
      }
    }
  });
}

function mostrarTurnoModal() {
  const modal = document.getElementById("turnoModal");
  const select = document.getElementById("turnoModalSelect");
  const btn = document.getElementById("turnoModalBtn");

  select.value = "";
  modal.style.display = "flex";

  modal.onclick = function(e) {
    if (e.target === modal) {
      e.stopPropagation();
    }
  };

  btn.onclick = function() {
    const turnoElegido = select.value;
    if (!turnoElegido) {
      alert("Debes seleccionar un turno para continuar.");
      return;
    }
    currentTurno = turnoElegido;
    localStorage.setItem("currentTurno", currentTurno);

    const turnoSelect = document.getElementById("turnoSelect");
    if (turnoSelect) turnoSelect.value = currentTurno;

    modal.style.display = "none";
    showCalculatorScreen();
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const turnoSelect = document.getElementById("turnoSelect");
  if (turnoSelect) {
    turnoSelect.value = currentTurno;
    turnoSelect.onchange = function() {
      currentTurno = this.value;
      localStorage.setItem("currentTurno", currentTurno);
    }
  }
});

function listenToFirebaseChanges() {
  if (!isFirebaseEnabled || !database || !currentFotocopiado) {
    console.log("[v0] Firebase no disponible para escuchar cambios")
    return
  }

  const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`)

  window.firebaseOnValue(
    fotocopiadoRef,
    (snapshot) => {
      try {
        if (snapshot.exists()) {
          const data = snapshot.val();
          calcRegistroVentas.efectivo = data.efectivo || 0;
          calcRegistroVentas.transferencia = data.transferencia || 0;
          calcRegistroVentas.ventas = data.ventas || [];
          calcRegistroVentas.perdidas = data.perdidas || [];
          calcRegistroVentas.totalPerdidas = data.totalPerdidas || 0;
          calcRegistroVentas.extras = data.extras || [];
          calcRegistroVentas.resetTimestamp = data.resetTimestamp || 0;
          calcRegistroVentas.lastUpdated = data.lastUpdated || 0;
          calcGuardarDatosLocal();
          calcActualizarTabla();
          updateSyncStatus("🔄", "Datos actualizados desde servidor");
        }
      } catch (error) {
        console.error("[v0] Error procesando cambios de Firebase:", error);
      }
    },
    (error) => {
      console.error("[v0] Error escuchando cambios de Firebase:", error);
      updateSyncStatus("🔴", "Error de conexión");
    }
  );
}

function showSyncNotification(message) {
  const notification = document.createElement("div")
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-size: 0.9rem;
    max-width: 300px;
    animation: slideIn 0.3s ease-out;
  `
  notification.textContent = message

  const style = document.createElement("style")
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `
  document.head.appendChild(style)

  document.body.appendChild(notification)

  setTimeout(() => {
    notification.style.animation = "slideIn 0.3s ease-out reverse"
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification)
      }
    }, 300)
  }, 3000)
}

function addOutsideClickListener() {
  document.addEventListener("click", (event) => {
    const turnoModal = document.getElementById("turnoModal");
    if (turnoModal && turnoModal.style.display === "flex") {
      if (turnoModal.contains(event.target)) return;
      return;
    }

    const loginScreen = document.getElementById("loginScreen");
    if (!loginScreen || loginScreen.style.display === "none") return;

    const clickedCard = event.target.closest(".fotocopiado-card");
    const clickedPasswordSection = event.target.closest(".password-section-inline");

    if (!clickedCard && !clickedPasswordSection) {
      cancelLogin();
    }
  });
}

function checkExistingSession() {
  localStorage.removeItem("currentFotocopiado")
  currentFotocopiado = null
  showLoginScreen()
}

function showLoginScreen() {
  const loginScreen = document.getElementById("loginScreen");
  const calculatorScreen = document.getElementById("calculatorScreen");
  loginScreen.style.display = "flex";
  calculatorScreen.style.display = "none";

  document.getElementById("turnoSelectorFixed").style.display = "none";

  const btnMenu = document.getElementById("btnMenuHamburguesa");
  if (btnMenu) btnMenu.classList.remove("oculto");
}

function showCalculatorScreen() {
  const loginScreen = document.getElementById("loginScreen");
  const calculatorScreen = document.getElementById("calculatorScreen");
  loginScreen.classList.add("animated-fadeOutDown", "animating");
  setTimeout(() => {
    loginScreen.style.display = "none";
    loginScreen.classList.remove("animated-fadeOutDown", "animating");
    calculatorScreen.style.display = "block";
    calculatorScreen.classList.add("animated-fadeInUp");
    setTimeout(() => {
      calculatorScreen.classList.remove("animated-fadeInUp");
    }, 500);
  }, 400);

  document.getElementById("turnoSelectorFixed").style.display = "flex";

  if (window.innerWidth <= 900) {
    const header = document.querySelector('.calc-header-text');
    const selector = document.getElementById("turnoSelectorFixed");
    if (header && selector && header.parentNode) {
      header.parentNode.insertBefore(selector, header);
    }
  }

  const fotocopiado = calcInstitutos[currentFotocopiado]
  document.getElementById("fotocopiadoTitle").textContent = fotocopiado.name
  document.getElementById("fotocopiadoSubtitle").textContent = fotocopiado.fullName

  showSyncNotification("Cargando datos más recientes del servidor...")

  calcArchivos = [];
  calcContadorArchivos = 0;
  calcTotal = 0;
  calcMetodoPago = null;
  document.getElementById("calcArchivosContainer").innerHTML = "";
  calcAgregarArchivo();

  loadFromFirebase().then(() => {
    calcActualizarTabla()
    listenToFirebaseChanges()
    setTimeout(() => {
      showSyncNotification("Datos actualizados correctamente")
    }, 1000)
  })
}

function selectFotocopiado(tipo) {
  document.querySelectorAll(".password-section-inline").forEach((section) => {
    section.style.display = "none"
  })

  document.querySelectorAll(".fotocopiado-card").forEach((card) => {
    card.classList.remove("selected")
  })

  event.target.closest(".fotocopiado-card").classList.add("selected")
  selectedFotocopiado = tipo

  const passwordSection = document.getElementById(`passwordSection-${tipo}`)
  const passwordInput = document.getElementById(`passwordInput-${tipo}`)

  if (passwordSection && passwordInput) {
    passwordSection.style.display = "block"
    passwordInput.value = ""
    passwordInput.focus()
  }
}

async function login(tipo = null) {
  const fotocopiadoType = tipo || selectedFotocopiado;
  const passwordInput = document.getElementById(`passwordInput-${fotocopiadoType}`);
  const password = passwordInput.value;

  if (!fotocopiadoType) {
    alert("Por favor selecciona un fotocopiado");
    return;
  }

  if (!contrasenasDinamicas) await cargarContrasenasDinamicas();

  const passCorrecta =
    contrasenasDinamicas?.[fotocopiadoType]?.actual ||
    (fotocopiadoType === "salud" ? "salud123" :
     fotocopiadoType === "sociales" ? "sociales123" :
     fotocopiadoType === "ingenieria" ? "ingenieria123" :
     fotocopiadoType === "hec_salud" ? "hec123" : "");

  if (password === passCorrecta) {
    if (passwordInput) passwordInput.blur();
    currentFotocopiado = fotocopiadoType;
    localStorage.setItem("currentFotocopiado", currentFotocopiado);
    mostrarTurnoModal();
  } else {
    alert("Contraseña incorrecta");
    if (passwordInput) {
      passwordInput.value = "";
      passwordInput.focus();
    }
  }
}

function cancelLogin(tipo = null) {
  if (tipo) {
    const passwordSection = document.getElementById(`passwordSection-${tipo}`)
    if (passwordSection) {
      passwordSection.style.display = "none"
    }
    document.querySelectorAll(".fotocopiado-card").forEach((card) => {
      if (card.onclick.toString().includes(tipo)) {
        card.classList.remove("selected")
      }
    })
  } else {
    selectedFotocopiado = null
    document.querySelectorAll(".password-section-inline").forEach((section) => {
      section.style.display = "none"
    })
    document.querySelectorAll(".fotocopiado-card").forEach((card) => {
      card.classList.remove("selected")
    })
  }
}

function logout() {
  if (confirm("¿Estás seguro de que quieres cerrar sesión?")) {
    if (isFirebaseEnabled && database && currentFotocopiado) {
      const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`)
      window.firebaseOff(fotocopiadoRef)
    }

    currentFotocopiado = null
    selectedFotocopiado = null
    localStorage.removeItem("currentFotocopiado")
    showLoginScreen()
  }
}

function calcCargarDatos() {
  if (!currentFotocopiado) return

  const datosGuardados = localStorage.getItem(`calcRegistroVentas_${currentFotocopiado}`)
  if (datosGuardados) {
    try {
      calcRegistroVentas = JSON.parse(datosGuardados)
    } catch (error) {
      console.error("Error al cargar datos:", error)
      calcRegistroVentas = {
        efectivo: 0,
        transferencia: 0,
        ventas: [],
      }
    }
  } else {
    calcRegistroVentas = {
      efectivo: 0,
      transferencia: 0,
      ventas: [],
    }
  }
}

function loadFromFirebase() {
  return new Promise((resolve) => {
    if (!isFirebaseEnabled || !database || !currentFotocopiado) {
      calcCargarDatos();
      resolve();
      return;
    }

    console.log("[v0] Forzando carga de datos más recientes desde Firebase...");
    updateSyncStatus("🔄", "Obteniendo datos actuales...");

    const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`);

    window
      .firebaseGet(fotocopiadoRef)
      .then((snapshot) => {
        try {
          const data = snapshot.val() || {};
          calcRegistroVentas = {
            efectivo: data.efectivo || 0,
            transferencia: data.transferencia || 0,
            ventas: data.ventas || [],
            extras: data.extras || [],
            perdidas: data.perdidas || [],
            totalPerdidas: data.totalPerdidas || 0,
            resetTimestamp: data.resetTimestamp || 0,
            isReset: data.isReset || false,
            lastUpdated: data.lastUpdated || 0,
            deviceId: data.deviceId || deviceId,
          };
          calcGuardarDatosLocal();
          calcActualizarTabla();
          updateSyncStatus("🟢", "Datos actualizados");
          if (typeof resolve === "function") resolve();
        } catch (error) {
          console.error("[v0] Error procesando datos de Firebase:", error);
          calcCargarDatos();
          updateSyncStatus("🔴", "Error de conexión");
          if (typeof resolve === "function") resolve();
        }
      })
      .catch((error) => {
        console.error("[v0] Error accediendo a Firebase:", error);
        calcCargarDatos();
        updateSyncStatus("🔴", "Error de conexión");
        if (typeof resolve === "function") resolve();
      });
  });
}

function calcOcultarDetalles() {
  const container = document.getElementById("calcDetallesContainer")
  if (container) {
    container.style.display = "none"
  }
}

function calcExportarExcel() {
  const ahora = new Date()
  const mes = ahora.toLocaleString("es-ES", { month: "long" })
  const año = ahora.getFullYear()
  const fechaHoy = ahora.toLocaleDateString("es-ES")
  const nombreCopiado = calcInstitutos[currentFotocopiado]?.name || "Copiado"

  const ventasEfectivo = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "efectivo").map(v => v.total)
  const ventasTransferencia = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "transferencia").map(v => v.total)
  const maxFilas = Math.max(ventasEfectivo.length, ventasTransferencia.length, 1)

  const filasVentas = []
  for (let i = 0; i < maxFilas; i++) {
    filasVentas.push([
      ventasEfectivo[i] !== undefined ? `$${ventasEfectivo[i]}` : "",
      ventasTransferencia[i] !== undefined ? `$${ventasTransferencia[i]}` : ""
    ])
  }

  const totalEfectivo = ventasEfectivo.reduce((a, b) => a + (parseFloat(b) || 0), 0)
  const totalTransferencia = ventasTransferencia.reduce((a, b) => a + (parseFloat(b) || 0), 0)
  const totalGeneral = totalEfectivo + totalTransferencia

  const datos = [
    ["Registro de ventas: " + nombreCopiado],
    [`Mes: ${mes.charAt(0).toUpperCase() + mes.slice(1)}   Año: ${año}`],
    [`Desde: ${fechaHoy}   Hasta: ${fechaHoy}`],
    [],
    ["Efectivo", "Transferencia"],
    ...filasVentas,
    [],
    ["Total Efectivo", "Total Transferencia", "Total General"],
    [`$${totalEfectivo}`, `$${totalTransferencia}`, `$${totalGeneral}`]
  ]

  const ws = XLSX.utils.aoa_to_sheet(datos)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Ventas")

  const nombreArchivo = `${nombreCopiado.replace(/\s/g, "_")}_${mes}_${año}.xlsx`
  XLSX.writeFile(wb, nombreArchivo)
}

function calcExportarPDF() {
  const ahora = new Date();
  const mes = ahora.toLocaleString("es-ES", { month: "long" });
  const año = ahora.getFullYear();
  const fechaHoy = ahora.toLocaleDateString("es-ES");
  const nombreCopiado = calcInstitutos[currentFotocopiado]?.name || "Copiado";
  const turno = obtenerNombreTurno(currentTurno);

  const ventas = calcRegistroVentas.ventas || [];

  const ventasDividido = ventas.filter(v => v.metodoPago === 'dividido');
  const totalDivididoEfectivo = ventasDividido.reduce((acc, v) => acc + (v.dividido?.efectivo || 0), 0);
  const totalDivididoTransferencia = ventasDividido.reduce((acc, v) => acc + (v.dividido?.transferencia || 0), 0);

  const totalEfectivo = ventas.filter(v => v.metodoPago === 'efectivo').reduce((acc, v) => acc + v.total, 0) + totalDivididoEfectivo;
  const totalTransferencia = ventas.filter(v => v.metodoPago === 'transferencia').reduce((acc, v) => acc + v.total, 0) + totalDivididoTransferencia;
  const totalGeneral = totalEfectivo + totalTransferencia;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Registro de Ventas - ${nombreCopiado}`, 14, 18);
  doc.setFontSize(12);
  doc.text(`Mes: ${mes.charAt(0).toUpperCase() + mes.slice(1)} ${año}`, 14, 26);
  doc.text(`Fecha: ${fechaHoy}`, 14, 32);
  doc.text(`Turno: ${turno}`, 14, 38);

  const ventasEfectivo = ventas.filter(v => v.metodoPago === 'efectivo').map(v => `$${v.total}`);
  const ventasTransferencia = ventas.filter(v => v.metodoPago === 'transferencia').map(v => `$${v.total}`);
  const maxFilas = Math.max(ventasEfectivo.length, ventasTransferencia.length);
  const tablaVentas = [];
  for (let i = 0; i < maxFilas; i++) {
    tablaVentas.push([
      ventasEfectivo[i] || '',
      ventasTransferencia[i] || ''
    ]);
  }

  let y = 46;
  doc.setFontSize(13);
  doc.text('Ventas:', 14, y);
  y += 8;
  doc.autoTable({
    head: [['Efectivo', 'Transferencia']],
    body: tablaVentas,
    startY: y,
    theme: 'grid',
    styles: { fontSize: 12 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
    bodyStyles: { fillColor: [245, 245, 245] }
  });
  y = doc.lastAutoTable.finalY + 10;

  if (ventasDividido.length > 0) {
    doc.setFontSize(13);
    doc.text('Pagos divididos:', 14, y);
    y += 8;
    const tablaDivididos = ventasDividido.map((v, i) => [
      `#${i + 1}`,
      v.fecha || "-",
      v.hora || "-",
      `$${v.total.toLocaleString("es-AR")}`,
      `$${v.dividido?.efectivo?.toLocaleString("es-AR") || 0}`,
      `$${v.dividido?.transferencia?.toLocaleString("es-AR") || 0}`,
      v.propina && v.propina > 0 ? `$${v.propina}` : "-"
    ]);
    doc.autoTable({
      head: [['N°', 'Fecha', 'Hora', 'Total', 'Efectivo', 'Transferencia', 'Propina']],
      body: tablaDivididos,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 11 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fillColor: [245, 245, 245] }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  doc.setFontSize(13);
  doc.text('Totales:', 14, y);
  y += 8;
  doc.autoTable({
    head: [['Concepto', 'Monto']],
    body: [
      ['Total ventas en efectivo', `$${totalEfectivo}`],
      ['Total ventas en transferencia', `$${totalTransferencia}`],
      ['Total general', `$${totalGeneral}`]
    ],
    startY: y,
    theme: 'grid',
    styles: { fontSize: 12 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
    bodyStyles: { fillColor: [245, 245, 245] }
  });
  y = doc.lastAutoTable.finalY + 10;

  const perdidas = calcRegistroVentas.perdidas || [];
  if (perdidas.length > 0) {
    doc.setFontSize(13);
    doc.text('Pérdidas registradas:', 14, y);
    y += 8;
    const tablaPerdidas = perdidas.map(p => [
      p.fecha,
      p.hora,
      p.nombre || "-",
      p.cantidad,
      p.tipo === "color" ? "Color" : "BN",
      p.motivo,
      `$${p.precioUnitario}`,
      `$${p.total}`
    ]);
    doc.autoTable({
      head: [['Fecha', 'Hora', 'Nombre', 'Cantidad', 'Tipo', 'Motivo', 'Precio unitario', 'Total']],
      body: tablaPerdidas,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 11 },
      headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fillColor: [255, 251, 235] }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  const extras = calcRegistroVentas.extras || [];
  if (extras.length > 0) {
    doc.setFontSize(13);
    doc.text('Extras registrados:', 14, y);
    y += 8;
    const tablaExtras = extras.map(e => [
      e.fecha,
      e.hora,
      e.motivo,
      e.cantidad,
      e.tipo === "color" ? "Color" : "Blanco y Negro",
      `$${e.precio || 0}`
    ]);
    doc.autoTable({
      head: [['Fecha', 'Hora', 'Motivo', 'Cantidad', 'Tipo', 'Precio']],
      body: tablaExtras,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 11 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fillColor: [245, 245, 245] }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  doc.save(`RegistroVentas_${nombreCopiado}_${mes}_${año}_${fechaHoy}_${turno}.pdf`);
}

async function exportarTodosLosRegistrosPDFZip() {
  const institutos = ["salud", "sociales", "ingenieria", "hec_salud"];
  const nombres = {
    salud: "Copiados_Salud",
    sociales: "Copiados_Sociales",
    ingenieria: "Copiados_Ingenieria",
    hec_salud: "HEC_Salud"
  };
  const zip = new JSZip();
  const ahora = new Date();
  const mes = ahora.toLocaleString("es-ES", { month: "long" });
  const año = ahora.getFullYear();
  const fechaHoy = ahora.toLocaleDateString("es-ES");
  const turno = currentTurno || "TM";

  for (const tipo of institutos) {
    let data = null;
    if (isFirebaseEnabled && database) {
      const ref = window.firebaseRef(database, `fotocopiados/${tipo}`);
      const snap = await window.firebaseGet(ref);
      data = snap.exists() ? snap.val() : { efectivo: 0, transferencia: 0, ventas: [], perdidas: [], totalPerdidas: 0, extras: [] };
    } else {
      data = JSON.parse(localStorage.getItem(`calcRegistroVentas_${tipo}`) || "{}");
      if (!data.perdidas) data.perdidas = [];
      if (!data.totalPerdidas) data.totalPerdidas = 0;
      if (!data.extras) data.extras = [];
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Registro de Ventas - ${nombres[tipo]}`, 14, 18);
    doc.setFontSize(12);
    doc.text(`Mes: ${mes.charAt(0).toUpperCase() + mes.slice(1)} ${año}`, 14, 26);
    doc.text(`Fecha: ${fechaHoy}`, 14, 32);
    doc.text(`Turno: ${obtenerNombreTurno(turno)}`, 14, 38);

    const ventas = data.ventas || [];
    const totalEfectivo = ventas.filter(v => v.metodoPago === 'efectivo').reduce((acc, v) => acc + v.total, 0);
    const totalTransferencia = ventas.filter(v => v.metodoPago === 'transferencia').reduce((acc, v) => acc + v.total, 0);
    const totalGeneral = totalEfectivo + totalTransferencia;
    const ventasEfectivo = ventas.filter(v => v.metodoPago === 'efectivo').map(v => `$${v.total}`);
    const ventasTransferencia = ventas.filter(v => v.metodoPago === 'transferencia').map(v => `$${v.total}`);
    const maxFilas = Math.max(ventasEfectivo.length, ventasTransferencia.length);
    const tablaVentas = [];
    for (let i = 0; i < maxFilas; i++) {
      tablaVentas.push([
        ventasEfectivo[i] || '',
        ventasTransferencia[i] || ''
      ]);
    }
    let y = 46;
    doc.setFontSize(13);
    doc.text('Ventas:', 14, y);
    y += 8;
    doc.autoTable({
      head: [['Efectivo', 'Transferencia']],
      body: tablaVentas,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 12 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fillColor: [245, 245, 245] }
    });
    y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.text('Totales:', 14, y);
    y += 8;
    doc.autoTable({
      head: [['Concepto', 'Monto']],
      body: [
        ['Total ventas en efectivo', `$${totalEfectivo}`],
        ['Total ventas en transferencia', `$${totalTransferencia}`],
        ['Total general', `$${totalGeneral}`]
      ],
      startY: y,
      theme: 'grid',
      styles: { fontSize: 12 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fillColor: [245, 245, 245] }
    });

    const perdidas = data.perdidas || [];
    if (perdidas.length > 0) {
      y = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(13);
      doc.text('Pérdidas registradas:', 14, y);
      y += 8;
      const tablaPerdidas = perdidas.map(p => [
        p.fecha,
        p.hora,
        p.nombre || "-",
        p.cantidad,
        p.tipo === "color" ? "Color" : "BN",
        p.motivo,
        `$${p.precioUnitario}`,
        `$${p.total}`
      ]);
      doc.autoTable({
        head: [['Fecha', 'Hora', 'Nombre', 'Cantidad', 'Tipo', 'Motivo', 'Precio unitario', 'Total']],
        body: tablaPerdidas,
        startY: y,
        theme: 'grid',
        styles: { fontSize: 11 },
        headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fillColor: [255, 251, 235] }
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    const extras = data.extras || [];
    if (extras.length > 0) {
      doc.setFontSize(13);
      doc.text('Extras registrados:', 14, y);
      y += 8;
      const tablaExtras = extras.map(e => [
        e.fecha,
        e.hora,
        e.motivo,
        e.cantidad,
        e.tipo === "color" ? "Color" : "Blanco y Negro",
        `$${e.precio || 0}`
      ]);
      doc.autoTable({
        head: [['Fecha', 'Hora', 'Motivo', 'Cantidad', 'Tipo', 'Precio']],
        body: tablaExtras,
        startY: y,
        theme: 'grid',
        styles: { fontSize: 11 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fillColor: [245, 245, 245] }
      });
    }

    const nombrePDF = `${nombres[tipo]}_${mes}_${año}_${fechaHoy}_${turno}.pdf`;
    const pdfBlob = doc.output("blob");
    zip.file(nombrePDF, pdfBlob);
  }

  const nombreZip = `Registros_Copiados_UNAJ_${mes}_${año}_${fechaHoy}_${turno}.zip`;
  zip.generateAsync({ type: "blob" }).then(function(content) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = nombreZip;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
    }, 100);
  });
}

function calcActualizarTabla() {
  const efectivo = calcRegistroVentas.efectivo || 0;
  const transferencia = calcRegistroVentas.transferencia || 0;
  const total = efectivo + transferencia;
  const ventasEfectivo = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "efectivo").length;
  const ventasTransferencia = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "transferencia").length;
  const ventasTotales = (calcRegistroVentas.ventas || []).length;
  const ventasDividido = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "dividido");
  const totalDividido = ventasDividido.reduce((acc, v) => acc + ((v.dividido?.efectivo || 0) + (v.dividido?.transferencia || 0)), 0);

  const totalDivididoEfectivo = ventasDividido.reduce((acc, v) => acc + (v.dividido?.efectivo || 0), 0);
  const totalDivididoTransferencia = ventasDividido.reduce((acc, v) => acc + (v.dividido?.transferencia || 0), 0);

  const elDividido = document.getElementById("calcTotalDividido");
  if (elDividido) {
    elDividido.innerHTML = `
      Efectivo: $${totalDivididoEfectivo.toLocaleString("es-AR")}
      &nbsp;|&nbsp;
      Transferencia: $${totalDivididoTransferencia.toLocaleString("es-AR")}
    `;
  }
  if (document.getElementById("calcCountDividido")) {
    document.getElementById("calcCountDividido").innerText = ventasDividido.length;
  }
  if (document.getElementById("calcTotalEfectivo")) {
    document.getElementById("calcTotalEfectivo").innerText = `$${efectivo.toLocaleString("es-AR")}`;
  }
  if (document.getElementById("calcTotalTransferencia")) {
    document.getElementById("calcTotalTransferencia").innerText = `$${transferencia.toLocaleString("es-AR")}`;
  }
  if (document.getElementById("calcTotalGeneral")) {
    document.getElementById("calcTotalGeneral").innerText = `$${total.toLocaleString("es-AR")}`;
  }
  if (document.getElementById("calcCountEfectivo")) {
    document.getElementById("calcCountEfectivo").innerText = ventasEfectivo;
  }
  if (document.getElementById("calcCountTransferencia")) {
    document.getElementById("calcCountTransferencia").innerText = ventasTransferencia;
  }
  if (document.getElementById("calcTotalVentas")) {
    document.getElementById("calcTotalVentas").innerText = `${ventasTotales} ventas`;
  }

  if (document.getElementById("calcTotalDivididoEfectivoMobile")) {
    document.getElementById("calcTotalDivididoEfectivoMobile").innerText = `$${totalDivididoEfectivo.toLocaleString("es-AR")}`;
  }
  if (document.getElementById("calcTotalDivididoTransferenciaMobile")) {
    document.getElementById("calcTotalDivididoTransferenciaMobile").innerText = `$${totalDivididoTransferencia.toLocaleString("es-AR")}`;
  }
  if (document.getElementById("calcCountDivididoMobile")) {
    document.getElementById("calcCountDivididoMobile").innerText = ventasDividido.length;
  }

  if (document.getElementById("calcTotalEfectivoMobile")) {
    document.getElementById("calcTotalEfectivoMobile").innerText = `$${efectivo.toLocaleString("es-AR")}`;
  }
  if (document.getElementById("calcTotalTransferenciaMobile")) {
    document.getElementById("calcTotalTransferenciaMobile").innerText = `$${transferencia.toLocaleString("es-AR")}`;
  }
  if (document.getElementById("calcTotalGeneralMobile")) {
    document.getElementById("calcTotalGeneralMobile").innerText = `$${total.toLocaleString("es-AR")}`;
  }
  if (document.getElementById("calcCountEfectivoMobile")) {
    document.getElementById("calcCountEfectivoMobile").innerText = ventasEfectivo;
  }
  if (document.getElementById("calcCountTransferenciaMobile")) {
    document.getElementById("calcCountTransferenciaMobile").innerText = ventasTransferencia;
  }
  if (document.getElementById("calcTotalVentasMobile")) {
    document.getElementById("calcTotalVentasMobile").innerText = `${ventasTotales} ventas`;
  }

  const extras = calcRegistroVentas.extras || [];
  const mobile = document.querySelector(".calc-table-mobile");
  if (mobile && !document.getElementById("calcTotalExtrasMobile")) {
    const card = document.createElement("div");
    card.className = "calc-mobile-card";
    card.innerHTML = `
      <div class="calc-mobile-card-header">
        <span>Extras</span>
        <span class="calc-mobile-card-total" id="calcTotalExtrasMobile">$0</span>
      </div>
      <div class="calc-mobile-card-actions">
        <button onclick="calcMostrarDetalles('extras')" class="calc-btn calc-btn-outline" style="padding: 8px 16px; font-size: 0.9rem;">
          Ver detalles (<span id="calcCountExtrasMobile">0</span>)
        </button>
      </div>
    `;
    mobile.insertBefore(card, mobile.lastElementChild);
  }
  const totalExtras = extras.reduce((acc, e) => acc + (e.precio || 0), 0);
  if (document.getElementById("calcTotalExtrasMobile")) {
    document.getElementById("calcTotalExtrasMobile").innerText = `$${totalExtras.toLocaleString("es-AR")}`;
  }
  if (document.getElementById("calcCountExtrasMobile")) {
    document.getElementById("calcCountExtrasMobile").innerText = extras.length;
  }
}

calcMostrarDetalles = function(tipo) {
  if (tipo === "perdidas") {
    return;
  }
  if (tipo === "extras") {
    return;
  }
  if (tipo === "dividido" || tipo === "efectivo" || tipo === "transferencia") {
    const container = document.getElementById("calcDetallesContainer");
    const content = document.getElementById("calcDetallesContent");
    const title = document.getElementById("calcDetallesTitle");
    let ventas = [];
    if (tipo === "dividido") {
      ventas = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "dividido");
      title.textContent = "Detalles de Pagos Divididos";
    } else if (tipo === "efectivo") {
      ventas = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "efectivo");
      title.textContent = "Detalles de Ventas (Efectivo)";
    } else if (tipo === "transferencia") {
      ventas = (calcRegistroVentas.ventas || []).filter(v => v.metodoPago === "transferencia");
      title.textContent = "Detalles de Ventas (Transferencia)";
    }
    if (ventas.length === 0) {
      content.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-secondary);">No hay ventas registradas en este método.</div>`;
    } else {
      content.innerHTML = ventas.map((venta, idx) => {
        const archivosHtml = venta.archivos.map((a, i) => `
          <div style="background:var(--bg-card-header);border:1px solid var(--border-color);border-radius:8px;padding:10px 14px;margin-bottom:10px;">
            <b>Archivo ${i + 1}</b> 
            <span style="margin-left:10px;">
              <b>Páginas:</b> ${a.paginas} 
              <b>Copias:</b> ${a.copias} 
              <b>Ajuste:</b> ${a.tipo === "1" ? "Simple/Doble faz" : `${a.tipo} pág/carilla`} 
              <b>Tipo impresión:</b> ${a.color === "color" ? "Color" : "Blanco y Negro"}
            </span>
            <div><b>Precio archivo:</b> $${calcularPrecioArchivo(a, venta.precioHojaBN, venta.precioHojaColor)}</div>
          </div>
        `).join("");
        let metodoPagoHtml = "";
        if (venta.metodoPago === "dividido") {
          metodoPagoHtml = `
            <br><b>Efectivo:</b> $${venta.dividido.efectivo.toLocaleString("es-AR")}
            <br><b>Transferencia:</b> $${venta.dividido.transferencia.toLocaleString("es-AR")}
          `;
        }
        return `
        <div class="calc-venta-item" style="margin-bottom:18px;">
          <div>
            <b>#${idx + 1} - Fecha:</b> ${venta.fecha} <b>Hora:</b> ${venta.hora}<br>
            <b>Total:</b> $${venta.total.toLocaleString("es-AR")}
            ${venta.propina && venta.propina > 0 ? `<br><b>Propina:</b> $${venta.propina}` : ""}
            ${metodoPagoHtml}
            <br><b>Precios:</b> BN $${venta.precioHojaBN} / Color $${venta.precioHojaColor}
          </div>
          <div style="margin-top:10px;"><b>Archivos de la venta:</b></div>
          ${archivosHtml}
          <div style="display:flex;gap:10px;margin-top:14px;">
            <button class="calc-btn calc-btn-danger" onclick="eliminarVentaPorIndice(${getVentaIndiceGlobal(venta)}, '${tipo}')">Eliminar</button>
            ${venta.metodoPago !== "dividido" ? `<button class="calc-btn calc-btn-secondary" onclick="cambiarMetodoPagoVenta(${getVentaIndiceGlobal(venta)}, '${tipo}')">Cambiar método de pago</button>` : ""}
            <button class="calc-btn calc-btn-success" onclick="mostrarPropinaDetalle(${getVentaIndiceGlobal(venta)})">Agregar/Modificar propina</button>
          </div>
        </div>
        `;
      }).join("");
    }
    container.style.display = "block";
    container.style.maxHeight = "80vh";
    container.style.overflowY = "auto";
    container.style.minHeight = "500px";
    setTimeout(() => {
      container.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return;
  }
  oldCalcMostrarDetalles(tipo);
};

function calcularPrecioArchivo(a, precioBN, precioColor) {
    const paginasPorCarilla = Number.parseInt(a.tipo) || 1;
    const hojasNecesarias = Math.ceil(a.paginas / paginasPorCarilla);
    const precioHoja = a.color === "color" ? precioColor : precioBN;
    return hojasNecesarias * precioHoja * a.copias;
}

function getVentaIndiceGlobal(venta) {
  return (calcRegistroVentas.ventas || []).findIndex(v => v.id === venta.id);
}

function eliminarVentaPorIndice(idx, tipo) {
  if (!confirm("¿Seguro que deseas eliminar esta venta?")) return;
  const venta = calcRegistroVentas.ventas[idx];
  if (!venta) return;

  if (venta.metodoPago === "efectivo") {
    calcRegistroVentas.efectivo -= venta.total;
  } else if (venta.metodoPago === "transferencia") {
    calcRegistroVentas.transferencia -= venta.total;
  } else if (venta.metodoPago === "dividido" && venta.dividido) {
    calcRegistroVentas.efectivo -= venta.dividido.efectivo || 0;
    calcRegistroVentas.transferencia -= venta.dividido.transferencia || 0;
  }

  calcRegistroVentas.ventas.splice(idx, 1);
  calcGuardarDatos();
  calcActualizarTabla();
  calcMostrarDetalles(tipo);
}

function cambiarMetodoPagoVenta(idx, tipoActual) {
  const venta = calcRegistroVentas.ventas[idx];
  if (!venta) return;
  if (venta.metodoPago === "efectivo") {
    calcRegistroVentas.efectivo = Math.max(0, calcRegistroVentas.efectivo - venta.total);
    calcRegistroVentas.transferencia += venta.total;
    venta.metodoPago = "transferencia";
  } else if (venta.metodoPago === "transferencia") {
    calcRegistroVentas.transferencia = Math.max(0, calcRegistroVentas.transferencia - venta.total);
    calcRegistroVentas.efectivo += venta.total;
    venta.metodoPago = "efectivo";
  }
  calcGuardarDatos();
  calcActualizarTabla();
  calcMostrarDetalles(tipoActual);
  showSyncNotification("La venta fue movida al otro método de pago. Haz clic en 'Ver detalles' del otro método para verla.");
}

function mostrarPropinaDetalle(idx) {
  const venta = calcRegistroVentas.ventas[idx];
  if (!venta) return;
  const nuevaPropina = prompt("Ingrese la nueva propina para esta venta:", venta.propina || 0);
  if (nuevaPropina === null) return;
  const propinaNum = Number.parseFloat(nuevaPropina) || 0;
  if (venta.metodoPago === "efectivo") {
    calcRegistroVentas.efectivo -= venta.total;
    venta.total = venta.total - (venta.propina || 0) + propinaNum;
    calcRegistroVentas.efectivo += venta.total;
  } else {
    calcRegistroVentas.transferencia -= venta.total;
    venta.total = venta.total - (venta.propina || 0) + propinaNum;
    calcRegistroVentas.transferencia += venta.total;
  }
  venta.propina = propinaNum;
  calcGuardarDatos();
  calcActualizarTabla();
  calcMostrarDetalles(venta.metodoPago);
}

async function pedirPasswordRecuperarBackup() {
  const pass = prompt("Ingrese la contraseña de administrador para recuperar el último registro:");
  if (!contrasenasDinamicas) await cargarContrasenasDinamicas();
  const passAdmin = contrasenasDinamicas?.admin || "admin123";
  if (pass !== passAdmin) {
    alert("Contraseña incorrecta. No se realizó la acción.");
    return;
  }
  calcRecuperarBackup();
}

async function calcRecuperarBackup() {
  if (isFirebaseEnabled && database && currentFotocopiado) {
    try {
      const backupsRef = window.firebaseRef(database, `backups/${currentFotocopiado}`);
      const snapshot = await window.firebaseGet(backupsRef);
      if (snapshot.exists()) {
        const backups = snapshot.val();
        const timestamps = Object.keys(backups).sort((a, b) => b - a);
        const ultimoBackup = backups[timestamps[0]];
        if (!ultimoBackup) {
          alert("No hay backup disponible.");
          return;
        }
        const ventasRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`);
        await window.firebaseSet(ventasRef, ultimoBackup);
        calcRegistroVentas = {
          efectivo: ultimoBackup.efectivo || 0,
          transferencia: ultimoBackup.transferencia || 0,
          ventas: ultimoBackup.ventas || [],
          perdidas: ultimoBackup.perdidas || [],
          totalPerdidas: ultimoBackup.totalPerdidas || 0,
          resetTimestamp: ultimoBackup.resetTimestamp || Date.now(),
        };
        calcGuardarDatosLocal();
        calcActualizarTabla();
        alert("Backup restaurado correctamente y sincronizado.");
      } else {
        alert("No hay backup disponible.");
      }
    } catch (error) {
      console.error("Error restaurando backup:", error);
      alert("Error al restaurar el backup.");
    }
  } else {
    const backup = localStorage.getItem(`calcRegistroVentas_backup_${currentFotocopiado}`);
    if (backup) {
      try {
        calcRegistroVentas = JSON.parse(backup);
        calcGuardarDatosLocal();
        calcActualizarTabla();
        alert("Backup local restaurado correctamente.");
      } catch (e) {
        alert("Error al restaurar el backup local.");
      }
    } else {
      alert("No hay backup local disponible.");
    }
  }
}

function actualizarYRefrescarTabla() {
  loadFromFirebase().then(() => {
    calcActualizarTabla();
    showSyncNotification("Datos actualizados desde el servidor.");
  });
}

if (!calcRegistroVentas.perdidas) {
  calcRegistroVentas.perdidas = [];
}

function mostrarModalPerdidas() {
  let modal = document.getElementById("modalPerdidas");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modalPerdidas";
    modal.style.cssText = `
      position:fixed;z-index:3000;top:0;left:0;width:100vw;height:100vh;
      background:rgba(30,41,59,0.45);backdrop-filter:blur(2px);
      display:flex;align-items:center;justify-content:center;
    `;
    modal.innerHTML = `
      <div style="background:var(--bg-card);padding:32px 24px;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.18);max-width:95vw;width:340px;text-align:center;">
        <h2 style="margin-bottom:18px;font-size:1.2rem;color:var(--text-heading);">Registrar pérdida</h2>
        <div style="margin-bottom:14px;">
          <label style="font-weight:600;">Nombre y apellido:</label>
          <input type="text" id="perdidasNombre" maxlength="60" class="calc-input" style="margin-top:6px;" placeholder="Nombre y apellido">
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-weight:600;">Cantidad de carillas:</label>
          <input type="number" id="perdidasCantidad" min="1" value="1" class="calc-input" style="margin-top:6px;">
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-weight:600;">Motivo:</label>
          <input type="text" id="perdidasMotivo" maxlength="80" class="calc-input" style="margin-top:6px;">
        </div>
        <div style="margin-bottom:18px;">
          <label style="font-weight:600;">Tipo:</label>
          <select id="perdidasTipo" class="calc-select" style="margin-top:6px;">
            <option value="bn">Blanco y Negro</option>
            <option value="color">Color</option>
          </select>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="calc-btn calc-btn-primary" id="btnAgregarPerdida">Agregar</button>
          <button class="calc-btn calc-btn-secondary" id="btnCancelarPerdida">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }

  document.getElementById("btnAgregarPerdida").onclick = function() {
    const nombre = document.getElementById("perdidasNombre").value.trim();
    const cantidad = parseInt(document.getElementById("perdidasCantidad").value) || 0;
    const motivo = document.getElementById("perdidasMotivo").value.trim();
    const tipo = document.getElementById("perdidasTipo").value;
    if (!nombre || cantidad <= 0 || !motivo) {
      alert("Debe ingresar nombre y apellido, una cantidad válida y un motivo.");
      return;
    }
    agregarPerdidaRegistro(cantidad, motivo, tipo, nombre);
    modal.style.display = "none";
  };
  document.getElementById("btnCancelarPerdida").onclick = function() {
    modal.style.display = "none";
  };
}

function agregarPerdidaRegistro(cantidad, motivo, tipo, nombre) {
  const precioHojaBN = Number.parseFloat(document.getElementById("calcPrecioHoja").value) || 0;
  const precioHojaColor = Number.parseFloat(document.getElementById("calcPrecioHojaColor").value) || 0;
  const precio = tipo === "color" ? precioHojaColor : precioHojaBN;
  const total = cantidad * precio;
  const perdida = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    fecha: new Date().toLocaleDateString("es-ES"),
    hora: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
    cantidad,
    motivo,
    tipo,
    nombre: nombre || "",
    precioUnitario: precio,
    total,
    deviceId: deviceId,
    timestamp: Date.now()
  };
  if (!calcRegistroVentas.perdidas) calcRegistroVentas.perdidas = [];
  calcRegistroVentas.perdidas.push(perdida);
  calcRegistroVentas.totalPerdidas = (calcRegistroVentas.totalPerdidas || 0) + total;
  calcGuardarDatos();
  calcActualizarTabla();
  showSyncNotification("Pérdida registrada y sincronizada.");
}

function mostrarModalExtras() {
  let modal = document.getElementById("modalExtras");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modalExtras";
    modal.style.cssText = `
      position:fixed;z-index:3000;top:0;left:0;width:100vw;height:100vh;
      background:rgba(30,41,59,0.45);backdrop-filter:blur(2px);
      display:flex;align-items:center;justify-content:center;
    `;
    modal.innerHTML = `
      <div style="background:var(--bg-card);padding:32px 24px;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.18);max-width:95vw;width:340px;text-align:center;">
        <h2 style="margin-bottom:18px;font-size:1.2rem;color:var(--text-heading);">Registrar extra</h2>
        <div style="margin-bottom:14px;">
          <label style="font-weight:600;">Cantidad de carillas:</label>
          <input type="number" id="extrasCantidad" min="1" value="1" class="calc-input" style="margin-top:6px;">
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-weight:600;">Motivo:</label>
          <input type="text" id="extrasMotivo" maxlength="80" class="calc-input" style="margin-top:6px;" placeholder="Motivo del extra">
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-weight:600;">Tipo:</label>
          <select id="extrasTipo" class="calc-select" style="margin-top:6px;">
            <option value="bn">Blanco y Negro</option>
            <option value="color">Color</option>
          </select>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="calc-btn calc-btn-primary" id="btnAgregarExtra">Agregar</button>
          <button class="calc-btn calc-btn-secondary" id="btnCancelarExtra">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }

  document.getElementById("btnAgregarExtra").onclick = function() {
    const cantidad = parseInt(document.getElementById("extrasCantidad").value) || 0;
    const motivo = document.getElementById("extrasMotivo").value.trim();
    const tipo = document.getElementById("extrasTipo").value;
    if (cantidad <= 0 || !motivo) {
      alert("Debe ingresar una cantidad válida y motivo.");
      return;
    }
    agregarExtraRegistro(cantidad, motivo, tipo);
    modal.style.display = "none";
  };
  document.getElementById("btnCancelarExtra").onclick = function() {
    modal.style.display = "none";
  };
}

function agregarExtraRegistro(cantidad, motivo, tipo) {
  const precioHojaBN = Number.parseFloat(document.getElementById("calcPrecioHoja").value) || 0;
  const precioHojaColor = Number.parseFloat(document.getElementById("calcPrecioHojaColor").value) || 0;
  const precioUnitario = tipo === "color" ? precioHojaColor : precioHojaBN;
  const precio = cantidad * precioUnitario;
  const extra = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    fecha: new Date().toLocaleDateString("es-ES"),
    hora: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
    cantidad,
    motivo,
    tipo,
    precioUnitario,
    precio,
    deviceId: deviceId,
    timestamp: Date.now()
  };
  if (!calcRegistroVentas.extras) calcRegistroVentas.extras = [];
  calcRegistroVentas.extras.push(extra);
  calcGuardarDatos();
  calcActualizarTabla();
  showSyncNotification("Extra registrado y sincronizado.");
}


function eliminarExtraPorIndice(idx) {
  if (!confirm("¿Seguro que deseas eliminar este extra?")) return;
  calcRegistroVentas.extras.splice(idx, 1);
  calcGuardarDatos();
  calcActualizarTabla();
  calcMostrarDetalles('extras');
}


const oldCalcActualizarTabla = calcActualizarTabla;
calcActualizarTabla = function() {
  oldCalcActualizarTabla();
  const totalPerdidas = calcRegistroVentas.totalPerdidas || 0;
  let perdidasRow = document.getElementById("calcTotalPerdidasRow");
  if (!perdidasRow) {
    const table = document.querySelector(".calc-table tbody");
    if (table) {
      perdidasRow = document.createElement("tr");
      perdidasRow.id = "calcTotalPerdidasRow";
      perdidasRow.innerHTML = `
        <td>Pérdidas</td>
        <td style="text-align: right; font-family: monospace; font-size: 1.1rem;" id="calcTotalPerdidas">$0</td>
        <td style="text-align: center;">
          <button onclick="calcMostrarDetalles('perdidas')" class="calc-btn calc-btn-outline" style="padding: 6px 12px; font-size: 0.9rem;">
            Ver detalles (<span id="calcCountPerdidas">0</span>)
          </button>
        </td>
      `;
      table.insertBefore(perdidasRow, table.lastElementChild);
    }
    const mobile = document.querySelector(".calc-table-mobile");
    if (mobile && !document.getElementById("calcTotalPerdidasMobile")) {
      const card = document.createElement("div");
      card.className = "calc-mobile-card";
      card.innerHTML = `
        <div class="calc-mobile-card-header">
          <span>Pérdidas</span>
          <span class="calc-mobile-card-total" id="calcTotalPerdidasMobile">$0</span>
        </div>
        <div class="calc-mobile-card-actions">
          <button onclick="calcMostrarDetalles('perdidas')" class="calc-btn calc-btn-outline" style="padding: 8px 16px; font-size: 0.9rem;">
            Ver detalles (<span id="calcCountPerdidasMobile">0</span>)
          </button>
        </div>
      `;
      mobile.insertBefore(card, mobile.lastElementChild);
    }
  }
  document.getElementById("calcTotalPerdidas").innerText = `$${totalPerdidas.toLocaleString("es-AR")}`;
  document.getElementById("calcTotalPerdidasMobile").innerText = `$${totalPerdidas.toLocaleString("es-AR")}`;
  const count = (calcRegistroVentas.perdidas || []).length;
  document.getElementById("calcCountPerdidas").innerText = count;
  document.getElementById("calcCountPerdidasMobile").innerText = count;

  const extras = calcRegistroVentas.extras || [];
  let extrasRow = document.getElementById("calcTotalExtrasRow");
  if (!extrasRow) {
    const table = document.querySelector(".calc-table tbody");
    if (table) {
      extrasRow = document.createElement("tr");
      extrasRow.id = "calcTotalExtrasRow";
      extrasRow.innerHTML = `
        <td>Extras</td>
        <td style="text-align: right; font-family: monospace; font-size: 1.1rem;" id="calcTotalExtras">$0</td>
        <td style="text-align: center;">
          <button onclick="calcMostrarDetalles('extras')" class="calc-btn calc-btn-outline" style="padding: 6px 12px; font-size: 0.9rem;">
            Ver detalles (<span id="calcCountExtras">0</span>)
          </button>
        </td>
      `;
      table.insertBefore(extrasRow, table.lastElementChild);
    }
  }
  const totalExtras = extras.reduce((acc, e) => acc + (e.precio || 0), 0);
  document.getElementById("calcTotalExtras").innerText = `$${totalExtras.toLocaleString("es-AR")}`;
  document.getElementById("calcCountExtras").innerText = extras.length;
};

const oldCalcMostrarDetalles = calcMostrarDetalles;
calcMostrarDetalles = function(tipo) {
  if (tipo === "perdidas") {
    const container = document.getElementById("calcDetallesContainer");
    const content = document.getElementById("calcDetallesContent");
    const title = document.getElementById("calcDetallesTitle");
    const perdidas = calcRegistroVentas.perdidas || [];
    title.textContent = "Detalles de Pérdidas";
    if (perdidas.length === 0) {
      content.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-secondary);">No hay pérdidas registradas.</div>`;
    } else {
      content.innerHTML = perdidas.map((p, idx) => `
        <div class="calc-venta-item" style="margin-bottom:18px;">
          <ul>
            <li><b>#${idx + 1}</b> - <b>Fecha:</b> ${p.fecha} <b>Hora:</b> ${p.hora}</li>
            <li><b>Nombre y apellido:</b> ${p.nombre ? p.nombre : "-"}</li>
            <li><b>Cantidad de carillas:</b> ${p.cantidad}</li>
            <li><b>Motivo:</b> ${p.motivo}</li>
            <li><b>Tipo:</b> ${p.tipo === "color" ? "Color" : "Blanco y Negro"}</li>
            <li><b>Precio unitario:</b> $${p.precioUnitario}</li>
            <li><b>Total pérdida:</b> $${p.total.toLocaleString("es-AR")}</li>
          </ul>
          <div style="margin-top:12px;">
            <button class="calc-btn calc-btn-danger" onclick="eliminarPerdidaPorIndice(${idx})">Eliminar</button>
          </div>
        </div>
      `).join("");
    }
    container.style.display = "block";
    container.style.maxHeight = "80vh";
    container.style.overflowY = "auto";
    container.style.minHeight = "500px";
    return;
  }
  if (tipo === "extras") {
    const container = document.getElementById("calcDetallesContainer");
    const content = document.getElementById("calcDetallesContent");
    const title = document.getElementById("calcDetallesTitle");
    const extras = calcRegistroVentas.extras || [];
    title.textContent = "Detalles de Extras";
    if (extras.length === 0) {
      content.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-secondary);">No hay extras registrados.</div>`;
    } else {
      content.innerHTML = extras.map((e, idx) => `
        <div class="calc-venta-item" style="margin-bottom:18px;">
          <ul>
            <li><b>#${idx + 1}</b> - <b>Fecha:</b> ${e.fecha} <b>Hora:</b> ${e.hora}</li>
            <li><b>Motivo:</b> ${e.motivo}</li>
            <li><b>Cantidad de carillas:</b> ${e.cantidad}</li>
            <li><b>Tipo:</b> ${e.tipo === "color" ? "Color" : "Blanco y Negro"}</li>
            <li><b>Precio:</b> $${(e.precio || 0).toLocaleString("es-AR")}</li>
          </ul>
          <div style="margin-top:12px;">
            <button class="calc-btn calc-btn-danger" onclick="eliminarExtraPorIndice(${idx})">Eliminar</button>
          </div>
        </div>
      `).join("");
    }
    container.style.display = "block";
    container.style.maxHeight = "80vh";
    container.style.overflowY = "auto";
    container.style.minHeight = "500px";
    return;
  }
  oldCalcMostrarDetalles(tipo);
};

const oldCalcCargarDatos = calcCargarDatos;
calcCargarDatos = function() {
  oldCalcCargarDatos();
  if (!calcRegistroVentas.perdidas) calcRegistroVentas.perdidas = [];
  if (!calcRegistroVentas.totalPerdidas) calcRegistroVentas.totalPerdidas = 0;
  if (!calcRegistroVentas.extras) calcRegistroVentas.extras = [];
};

const oldLoadFromFirebase = loadFromFirebase;
loadFromFirebase = function() {
  return new Promise((resolve) => {
    oldLoadFromFirebase().then(() => {
      if (!calcRegistroVentas.perdidas) calcRegistroVentas.perdidas = [];
      if (!calcRegistroVentas.totalPerdidas) calcRegistroVentas.totalPerdidas = 0;
      if (!calcRegistroVentas.extras) calcRegistroVentas.extras = [];
      resolve();
    });
  });
};

const oldSyncToFirebase = syncToFirebase;
syncToFirebase = function() {
  if (!isFirebaseEnabled || !database || !currentFotocopiado) {
    return Promise.resolve();
  }
  return areLocalDataValid().then((isValid) => {
    if (!isValid) return calcCargarDatosIniciales();
    return new Promise((resolve, reject) => {
      try {
        const dataToSync = {
          efectivo: calcRegistroVentas.efectivo || 0,
          transferencia: calcRegistroVentas.transferencia || 0,
          ventas: calcRegistroVentas.ventas || [],
          perdidas: calcRegistroVentas.perdidas || [],
          totalPerdidas: calcRegistroVentas.totalPerdidas || 0,
          extras: calcRegistroVentas.extras || [],
          lastUpdated: Date.now(),
          deviceId: deviceId,
          resetTimestamp: calcRegistroVentas.resetTimestamp || 0,
        };
        const fotocopiadoRef = window.firebaseRef(database, `fotocopiados/${currentFotocopiado}`);
        window.firebaseSet(fotocopiadoRef, dataToSync)
          .then(() => {
            updateSyncStatus("🟢", "Sincronizado");
            calcRegistroVentas.lastUpdated = dataToSync.lastUpdated;
            resolve();
          })
          .catch((error) => {
            updateSyncStatus("🔴", "Error de sincronización");
            reject(error);
          });
      } catch (error) {
        updateSyncStatus("🔴", "Error de sincronización");
        reject(error);
      }
    });
  });
};


function mostrarEstadisticasDesdeLogin() {
  cameFromLogin = true;
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("calcComparativaScreen").style.display = "block";
  calcMostrarComparativa();
}


function eliminarPerdidaPorIndice(idx) {
  if (!confirm("¿Seguro que deseas eliminar esta pérdida?")) return;
  calcRegistroVentas.perdidas.splice(idx, 1);
  calcRegistroVentas.totalPerdidas = (calcRegistroVentas.perdidas || []).reduce((acc, p) => acc + (p.total || 0), 0);
  calcGuardarDatos();
  calcActualizarTabla();
  calcMostrarDetalles('perdidas');
}


function abrirModalHistorico() {
  document.getElementById("modalHistorico").style.display = "flex";
  document.getElementById("resultadoHistorico").innerHTML = "";
}

function cerrarModalHistorico() {
  document.getElementById("modalHistorico").style.display = "none";
}

async function consultarHistorico() {
  const tipo = document.getElementById("historicoFotocopiado").value;
  const fecha = document.getElementById("historicoFecha").value;
  const turno = document.getElementById("historicoTurno").value;
  const resultadoDiv = document.getElementById("resultadoHistorico");
  const btnExportar = document.getElementById("btnExportarHistoricoPDF");

  if (!tipo || !fecha || !turno) {
    resultadoDiv.innerHTML = "<span style='color:#ef4444;'>Completa todos los campos.</span>";
    if (btnExportar) btnExportar.style.display = "none";
    window._historicoDatosParaPDF = null;
    return;
  }

  if (!isFirebaseEnabled || !database) {
    resultadoDiv.innerHTML = "<span style='color:#ef4444;'>Firebase no disponible.</span>";
    if (btnExportar) btnExportar.style.display = "none";
    window._historicoDatosParaPDF = null;
    return;
  }

  const [anio, mes, dia] = fecha.split("-");
  const mesStr = `${anio}-${mes}`;
  const fecha1 = `${dia}/${mes}/${anio}`;
  const fecha2 = `${parseInt(dia)}/${parseInt(mes)}/${anio}`;
  const fecha3 = `${dia}/${mes}/${anio.slice(-2)}`;
  const fecha4 = `${parseInt(dia)}/${parseInt(mes)}/${anio.slice(-2)}`;

  let encontrados = [];

  try {
    const historicosRef = window.firebaseRef(database, `historicos/${tipo}/${mesStr}/${turno}`);
    const snap = await window.firebaseGet(historicosRef);
    if (snap.exists()) {
      const registros = snap.val();
      for (const key in registros) {
        const f = registros[key].fecha;
        if (
          f === fecha1 ||
          f === fecha2 ||
          f === fecha3 ||
          f === fecha4
        ) {
          encontrados.push(registros[key]);
        }
      }
    }
    if (encontrados.length > 0) {
      let totalEfectivo = 0, totalTransferencia = 0, totalDividido = 0;
      let ventas = [], perdidas = [], extras = [];
      let ventasDividido = [];
      encontrados.forEach(r => {
        totalEfectivo += r.efectivo || 0;
        totalTransferencia += r.transferencia || 0;
        ventas = ventas.concat(r.ventas || []);
        perdidas = perdidas.concat(r.perdidas || []);
        extras = extras.concat(r.extras || []);
      });
      ventasDividido = ventas.filter(v => v.metodoPago === "dividido");
      totalDividido = ventasDividido.reduce((acc, v) => acc + ((v.dividido?.efectivo || 0) + (v.dividido?.transferencia || 0)), 0);
      const totalPerdidas = perdidas.reduce((acc, p) => acc + (p.total || 0), 0);
      const totalExtras = extras.reduce((acc, e) => acc + (e.precio || 0), 0);

      resultadoDiv.innerHTML = `
        <div class="historico-resumen">
          <h3>Resumen del día</h3>
          <div><span class="historico-label">Copiado:</span> <span class="historico-valor">${calcInstitutos[tipo]?.name || tipo}</span></div>
          <div><span class="historico-label">Fecha:</span> <span class="historico-valor">${fecha1}</span></div>
          <div><span class="historico-label">Turno:</span> <span class="historico-valor">${obtenerNombreTurno(turno)}</span></div>
          <div><span class="historico-label">Efectivo:</span> <span class="historico-valor">$${totalEfectivo.toLocaleString("es-AR")}</span></div>
          <div><span class="historico-label">Transferencia:</span> <span class="historico-valor">$${totalTransferencia.toLocaleString("es-AR")}</span></div>
          <div><span class="historico-label">Pagos divididos:</span> <span class="historico-valor">$${totalDividido.toLocaleString("es-AR")}</span></div>
          <div><span class="historico-label">Total:</span> <span class="historico-valor">$${(totalEfectivo + totalTransferencia + totalDividido).toLocaleString("es-AR")}</span></div>
          <div><span class="historico-label">Ventas:</span> <span class="historico-valor">${ventas.length}</span></div>
          <div><span class="historico-label">Ventas en efectivo:</span> <span class="historico-valor">${ventas.filter(v => v.metodoPago === "efectivo").length}</span></div>
          <div><span class="historico-label">Ventas por transferencia:</span> <span class="historico-valor">${ventas.filter(v => v.metodoPago === "transferencia").length}</span></div>
          <div><span class="historico-label">Ventas divididas:</span> <span class="historico-valor">${ventasDividido.length}</span></div>
          ${ventasDividido.length > 0 ? `
            <hr>
            <div><b>Detalle de pagos divididos:</b></div>
            <ul class="historico-lista">
              ${ventasDividido.map((v, i) => `
                <li>
                  <b>#${i + 1}</b> - <b>Fecha:</b> ${v.fecha || "-"} <b>Hora:</b> ${v.hora || "-"}
                  <br><b>Total:</b> $${v.total.toLocaleString("es-AR")}
                  <br><b>Efectivo:</b> $${v.dividido?.efectivo?.toLocaleString("es-AR") || 0}
                  <b>Transferencia:</b> $${v.dividido?.transferencia?.toLocaleString("es-AR") || 0}
                  ${v.propina && v.propina > 0 ? `<br><b>Propina:</b> $${v.propina}` : ""}
                </li>
              `).join("")}
            </ul>
          ` : ""}
          <hr>
          <div><b>Pérdidas:</b> ${perdidas.length}</div>
          ${perdidas.length > 0 ? `
            <ul class="historico-lista">
              ${perdidas.map(p => `<li>
                <b>${p.cantidad}</b> carillas (${p.tipo === "color" ? "Color" : "BN"}) - $${(p.total || 0).toLocaleString("es-AR")}
                ${p.motivo ? `- Motivo: ${p.motivo}` : ""}
              </li>`).join("")}
            </ul>
            <div class="historico-total"><b>Total pérdidas:</b> $${totalPerdidas.toLocaleString("es-AR")}</div>
          ` : `<div class="historico-vacio">No hay pérdidas registradas.</div>`}
          <hr>
          <div><b>Extras:</b> ${extras.length}</div>
          ${extras.length > 0 ? `
            <ul class="historico-lista">
              ${extras.map(e => `<li>
                <b>${e.cantidad}</b> carillas (${e.tipo === "color" ? "Color" : "BN"}) - $${(e.precio || 0).toLocaleString("es-AR")}
                ${e.motivo ? `- Motivo: ${e.motivo}` : ""}
              </li>`).join("")}
            </ul>
            <div class="historico-total"><b>Total extras:</b> $${totalExtras.toLocaleString("es-AR")}</div>
          ` : `<div class="historico-vacio">No hay extras registrados.</div>`}
        </div>
      `;
      
      if (btnExportar) btnExportar.style.display = "inline-block";
      window._historicoDatosParaPDF = {
        copiado: tipo,
        copiadoNombre: calcInstitutos[tipo]?.name || tipo,
        fecha: fecha1,
        turno,
        efectivo: totalEfectivo,
        transferencia: totalTransferencia,
        dividido: totalDividido,
        ventas,
        ventasDividido,
        perdidas,
        totalPerdidas,
        extras
      };
    } else {
      resultadoDiv.innerHTML = "<span style='color:#ef4444;'>No se encontraron registros para esa fecha y turno.</span>";
      if (btnExportar) btnExportar.style.display = "none";
      window._historicoDatosParaPDF = null;
    }
  } catch (error) {
    resultadoDiv.innerHTML = "<span style='color:#ef4444;'>Error consultando historial.</span>";
    if (btnExportar) btnExportar.style.display = "none";
    window._historicoDatosParaPDF = null;
  }
}

document.getElementById("btnExportarHistoricoPDF").onclick = function() {
  const datos = window._historicoDatosParaPDF;
  if (!datos) return;

  const copiadoNombre = datos.copiadoNombre || calcInstitutos[datos.copiado]?.name || datos.copiado || "Copiado";
  const fecha = datos.fecha || "";
  const turnoTxt = obtenerNombreTurno(datos.turno);

  let mes = "";
  let año = "";
  if (fecha.includes("/")) {
    const partes = fecha.split("/");
    mes = partes[1];
    año = partes[2];
  }
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const mesNombre = meses[parseInt(mes,10)-1] || "";

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text(`Registro de Ventas - ${copiadoNombre}`, 14, 18);

  doc.setFontSize(12);
  doc.text(`Copiado: ${copiadoNombre}`, 14, 26);
  doc.text(`Mes: ${mesNombre} ${año}`, 14, 32);
  doc.text(`Fecha: ${fecha}`, 14, 38);
  doc.text(`Turno: ${turnoTxt}`, 14, 44);

  const ventasEfectivo = (datos.ventas || []).filter(v => v.metodoPago === 'efectivo').map(v => `$${v.total}`);
  const ventasTransferencia = (datos.ventas || []).filter(v => v.metodoPago === 'transferencia').map(v => `$${v.total}`);
  const maxFilas = Math.max(ventasEfectivo.length, ventasTransferencia.length);
  const tablaVentas = [];
  for (let i = 0; i < maxFilas; i++) {
    tablaVentas.push([
      ventasEfectivo[i] || '',
      ventasTransferencia[i] || ''
    ]);
  }

  let y = 52;
  doc.setFontSize(13);
  doc.text('Ventas:', 14, y);
  y += 8;
  doc.autoTable({
    head: [['Efectivo', 'Transferencia']],
    body: tablaVentas,
    startY: y,
    theme: 'grid',
    styles: { fontSize: 12 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
    bodyStyles: { fillColor: [245, 245, 245] }
  });
  y = doc.lastAutoTable.finalY + 10;

  if (datos.ventasDividido && datos.ventasDividido.length > 0) {
    doc.setFontSize(13);
    doc.text('Pagos divididos:', 14, y);
    y += 8;
    const tablaDivididos = datos.ventasDividido.map((v, i) => [
      `#${i + 1}`,
      v.fecha || "-",
      v.hora || "-",
      `$${v.total.toLocaleString("es-AR")}`,
      `$${v.dividido?.efectivo?.toLocaleString("es-AR") || 0}`,
      `$${v.dividido?.transferencia?.toLocaleString("es-AR") || 0}`,
      v.propina && v.propina > 0 ? `$${v.propina}` : "-"
    ]);
    doc.autoTable({
      head: [['N°', 'Fecha', 'Hora', 'Total', 'Efectivo', 'Transferencia', 'Propina']],
      body: tablaDivididos,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 11 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fillColor: [245, 245, 245] }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  doc.setFontSize(13);
  doc.text('Totales:', 14, y);
  y += 8;
  doc.autoTable({
    head: [['Concepto', 'Monto']],
    body: [
      ['Total ventas en efectivo', `$${(datos.efectivo || 0).toLocaleString("es-AR")}`],
      ['Total ventas en transferencia', `$${(datos.transferencia || 0).toLocaleString("es-AR")}`],
      ['Total pagos divididos', `$${(datos.dividido || 0).toLocaleString("es-AR")}`],
      ['Total general', `$${((datos.efectivo || 0) + (datos.transferencia || 0) + (datos.dividido || 0)).toLocaleString("es-AR")}`]
    ],
    startY: y,
    theme: 'grid',
    styles: { fontSize: 12 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
    bodyStyles: { fillColor: [245, 245, 245] }
  });
  y = doc.lastAutoTable.finalY + 10;

  if (datos.perdidas && datos.perdidas.length > 0) {
    doc.setFontSize(13);
    doc.text('Pérdidas registradas:', 14, y);
    y += 8;
    const tablaPerdidas = datos.perdidas.map(p => [
      p.fecha || fecha,
      p.hora || "-",
      p.nombre || "-",
      p.cantidad,
      p.tipo === "color" ? "Color" : "BN",
      p.motivo,
      `$${p.precioUnitario}`,
      `$${p.total}`
    ]);
    doc.autoTable({
      head: [['Fecha', 'Hora', 'Nombre', 'Cantidad', 'Tipo', 'Motivo', 'Precio unitario', 'Total']],
      body: tablaPerdidas,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 11 },
      headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fillColor: [255, 251, 235] }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (datos.extras && datos.extras.length > 0) {
    doc.setFontSize(13);
    doc.text('Extras registrados:', 14, y);
    y += 8;
    const tablaExtras = datos.extras.map(e => [
      e.fecha || fecha,
      e.hora || "-",
      e.motivo,
      e.cantidad,
      e.tipo === "color" ? "Color" : "Blanco y Negro",
      `$${e.precio || 0}`
    ]);
    doc.autoTable({
      head: [['Fecha', 'Hora', 'Motivo', 'Cantidad', 'Tipo', 'Precio']],
      body: tablaExtras,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 11 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fillColor: [245, 245, 245] }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  const nombreArchivo = `RegistroVentas_${copiadoNombre.replace(/\s/g, "_")}_${mesNombre}_${año}_${fecha}_${turnoTxt}.pdf`;
  doc.save(nombreArchivo);
};

document.getElementById("btnReportesSugerencias").onclick = function() {
  document.getElementById("modalReportesSugerencias").style.display = "flex";
  document.getElementById("reportNombre").value = "";
  document.getElementById("reportDescripcion").value = "";
  document.getElementById("msgReporte").textContent = "";
};

document.getElementById("btnCancelarReporte").onclick = function() {
  document.getElementById("modalReportesSugerencias").style.display = "none";
};

document.getElementById("btnAgregarReporte").onclick = async function() {
  const tipo = document.getElementById("reportTipo").value;
  const nombre = document.getElementById("reportNombre").value.trim();
  const descripcion = document.getElementById("reportDescripcion").value.trim();
  const msg = document.getElementById("msgReporte");
  if (!nombre || !descripcion) {
    msg.textContent = "Completa todos los campos obligatorios.";
    return;
  }
  msg.textContent = "";
  const ahora = new Date();
  const reporte = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tipo,
    nombre,
    descripcion,
    fecha: ahora.toLocaleDateString("es-ES"),
    hora: ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
    estado: "revision",
    timestamp: Date.now(),
  };
  if (isFirebaseEnabled && database) {
    const mes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
    const ref = window.firebaseRef(database, `reportes/${mes}/${reporte.id}`);
    await window.firebaseSet(ref, reporte);
    document.getElementById("modalReportesSugerencias").style.display = "none";
    showSyncNotification("Reporte/Sugerencia enviado correctamente.");
    if (typeof mostrarReportesPanelControl === "function") {
      mostrarReportesPanelControl();
    }
  } else {
    msg.textContent = "No se pudo enviar. Intenta más tarde.";
  }
};


async function actualizarEstadoReporte(id, estado) {
  const mes = document.getElementById("filtroMesReporte").value;
  const ref = window.firebaseRef(database, `reportes/${mes}/${id}`);
  const snap = await window.firebaseGet(ref);
  if (snap.exists()) {
    const reporte = snap.val();
    reporte.estado = estado;
    await window.firebaseSet(ref, reporte);
    mostrarReportesPanelControl();
  }
}

async function eliminarReporte(id) {
  if (!confirm("¿Seguro que deseas eliminar este reporte/sugerencia?")) return;
  const mes = document.getElementById("filtroMesReporte").value;
  const ref = window.firebaseRef(database, `reportes/${mes}/${id}`);
  await window.firebaseSet(ref, null);
  mostrarReportesPanelControl();
}

document.addEventListener("DOMContentLoaded", () => {
  function intentarMostrarReportes() {
    if (document.getElementById("calcComparativaScreen") && window.firebaseInitialized) {
      mostrarReportesPanelControl();
    } else {
      setTimeout(intentarMostrarReportes, 300);
    }
  }
  intentarMostrarReportes();
});

async function mostrarReportesPanelControl() {
  let meses = [];
  if (isFirebaseEnabled && database) {
    const refMeses = window.firebaseRef(database, "reportes");
    const snapMeses = await window.firebaseGet(refMeses);
    if (snapMeses.exists()) {
      meses = Object.keys(snapMeses.val()).sort().reverse();
    }
  }
  const ahora = new Date();
  const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
  if (!meses.includes(mesActual)) {
    meses.unshift(mesActual);
  }

  let mesSeleccionado = mesActual;
  const filtroMes = document.getElementById("filtroMesReporte");
  if (filtroMes && filtroMes.value && meses.includes(filtroMes.value)) {
    mesSeleccionado = filtroMes.value;
  } else {
    mesSeleccionado = meses[0];
  }

  let reportes = [];
  if (isFirebaseEnabled && database) {
    const ref = window.firebaseRef(database, `reportes/${mesSeleccionado}`);
    const snap = await window.firebaseGet(ref);
    if (snap.exists()) {
      reportes = Object.values(snap.val());
    }
  }
  reportes.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  let container = document.getElementById("reportesPanelControl");
  if (!container) {
    container = document.createElement("div");
    container.id = "reportesPanelControl";
    container.className = "calc-card";
    document.getElementById("calcComparativaScreen").appendChild(container);
  }
  container.innerHTML = `
    <div class="calc-card-header">
      <div class="calc-card-title">Reportes y Sugerencias</div>
      <div style="margin-top:10px;">
        <select id="filtroEstadoReporte" class="calc-select" style="width:auto;display:inline-block;">
          <option value="todos">Todos</option>
          <option value="revision">En revisión</option>
          <option value="solucionado">Solucionado</option>
          <option value="descartado">Descartado</option>
        </select>
        <select id="filtroMesReporte" class="calc-select" style="width:auto;display:inline-block;">
          ${meses.map(m => `<option value="${m}"${m === mesSeleccionado ? " selected" : ""}>${formatearMes(m)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="calc-card-content" id="reportesListaPanel"></div>
  `;

  function renderReportes() {
    const estado = document.getElementById("filtroEstadoReporte").value;
    let filtrados = reportes;
    if (estado !== "todos") filtrados = reportes.filter(r => r.estado === estado);
    const lista = document.getElementById("reportesListaPanel");
    if (filtrados.length === 0) {
      lista.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-secondary);">No hay reportes/sugerencias.</div>`;
    } else {
      lista.innerHTML = filtrados.map(r => `
        <div style="border:1px solid var(--border-color);border-radius:8px;padding:12px;margin-bottom:10px;">
          <b>${r.tipo === "reporte" ? "Reporte" : "Sugerencia"}</b> - <span style="color:var(--text-secondary);">${r.estado}</span><br>
          <b>${r.nombre}</b> <span style="font-size:0.9rem;color:var(--text-secondary);">(${r.fecha} ${r.hora})</span><br>
          <div style="margin:8px 0;">${r.descripcion}</div>
          <div style="display:flex;gap:8px;">
            <select onchange="actualizarEstadoReporte('${r.id}',this.value)" style="padding:4px 8px;">
              <option value="revision"${r.estado==="revision"?" selected":""}>En revisión</option>
              <option value="solucionado"${r.estado==="solucionado"?" selected":""}>Solucionado</option>
              <option value="descartado"${r.estado==="descartado"?" selected":""}>Descartado</option>
            </select>
            <button class="calc-btn calc-btn-danger" onclick="eliminarReporte('${r.id}')">Eliminar</button>
          </div>
        </div>
      `).join("");
    }
  }
  renderReportes();

  document.getElementById("filtroEstadoReporte").onchange = renderReportes;
  document.getElementById("filtroMesReporte").onchange = async function() {
    mostrarReportesPanelControl();
  };
  document.getElementById("filtroEstadoReporte").value = "revision";
}

const IMPRESORAS_TODAS = [
  "MAR",
  "LUME",
  "DOHKO",
  "MAURO B/N",
  "MAURO COLOR",
  "MESSI",
  "MONI",
  "VALEN",
  "CRUCECITA B/N",
  "CRUCECITA COLOR",
  "NAHUEL B/N",
  "NAHUEL COLOR",
  "LUPE B/N",
  "LUPE COLOR",
  "FELIX",
  "MARI HEC",
  "MARI HEC COLOR",
  "DANY HEC",
  "DANY HEC COLOR",
  "POCHA B/N",
  "POCHA COLOR"
];

let storage = null;
let storageRef = null;
let uploadBytes = null;
let getDownloadURL = null;

if (typeof window.firebaseApp !== "undefined") {
  import('https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js').then(mod => {
    storage = mod.getStorage(window.firebaseApp);
    storageRef = mod.ref;
    uploadBytes = mod.uploadBytes;
    getDownloadURL = mod.getDownloadURL;
    window.firebaseStorage = storage;
    window.firebaseStorageRef = storageRef;
    window.firebaseUploadBytes = uploadBytes;
    window.firebaseGetDownloadURL = getDownloadURL;
  });
}

function mostrarModalErrorImpresoras(mensaje) {
  let modal = document.getElementById("modalErrorImpresoras");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modalErrorImpresoras";
    modal.innerHTML = `
      <div class="modal-error-content">
        <h3>No se puede guardar el registro</h3>
        <div id="modalErrorImpresorasMensaje">${mensaje}</div>
        <button class="calc-btn calc-btn-primary" onclick="document.getElementById('modalErrorImpresoras').style.display='none'">Aceptar</button>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    document.getElementById("modalErrorImpresorasMensaje").innerHTML = mensaje;
    modal.style.display = "flex";
  }
}

document.getElementById("btnGuardarRegistroImpresoras").onclick = async function() {
  const copiado = document.getElementById("registroCopiado").value;
  const turno = document.getElementById("registroTurno").value;
  const fecha = document.getElementById("registroFecha").value;
  const seleccionadas = Array.from(document.querySelectorAll(".impresora-checkbox:checked")).map(cb => cb.value);

  if (!window.firebaseInitialized || !window.firebaseDatabase) {
    mostrarModalErrorImpresoras("Firebase no disponible.");
    return;
  }

  let impresorasData = [];
  let negativas = [];
  for (const nombre of seleccionadas) {
    const apertura = Number(document.getElementById(`apertura_${nombre}`).value);
    const cierre = Number(document.getElementById(`cierre_${nombre}`).value);
    const diferencia = cierre - apertura;
    impresorasData.push({
      nombre,
      apertura,
      cierre,
      diferencia,
      copiado,
      turno,
      fecha
    });
    if (diferencia < 0) {
      negativas.push(nombre);
    }
  }

  if (negativas.length > 0) {
    mostrarModalErrorImpresoras(
      `Las siguientes impresoras tienen diferencia negativa:<br><br>
      <b>${negativas.join("<br>")}</b><br><br>
      Verifica los valores de apertura y cierre.`
    );
    return;
  }

  const ref = window.firebaseRef(window.firebaseDatabase, `registro_impresoras/${fecha}/${copiado}/${turno}`);
  await window.firebaseSet(ref, impresorasData);

  document.getElementById("modalRegistroImpresoras").style.display = "none";
  alert("Registro guardado correctamente.");
};


document.getElementById("btnRegistrarImpresoras").onclick = function() {
  document.getElementById("modalRegistroImpresoras").style.display = "flex";
  document.getElementById("registroFecha").value = new Date().toISOString().slice(0,10);
  renderImpresorasCheckbox();
  renderImpresorasArchivos();
};

document.getElementById("btnCancelarRegistroImpresoras").onclick = function() {
  document.getElementById("modalRegistroImpresoras").style.display = "none";
};

function renderImpresorasCheckbox() {
  const cont = document.getElementById("registroImpresorasLista");
  cont.innerHTML = `<div id="impresorasCheckboxes"></div>`;

  const grupos = {
    "Blanco y Negro": [],
    "Color": [],
    "HEC": [],
    "Otros": []
  };
  IMPRESORAS_TODAS.forEach(nombre => {
    if (nombre.includes("COLOR")) grupos["Color"].push(nombre);
    else if (nombre.includes("B/N")) grupos["Blanco y Negro"].push(nombre);
    else if (nombre.includes("HEC")) grupos["HEC"].push(nombre);
    else grupos["Otros"].push(nombre);
  });

  function renderLista() {
    const seleccionadas = Array.from(document.querySelectorAll(".impresora-checkbox:checked")).map(cb => cb.value);

    let html = "";
    Object.entries(grupos).forEach(([grupo, lista]) => {
      if (lista.length === 0) return;
      html += `<div style="margin-bottom:6px;font-weight:600;color:var(--text-heading);font-size:1rem;">${grupo}</div>`;
      html += lista.map(nombre => `
        <label style="display:flex;align-items:center;margin-bottom:4px;gap:6px;">
          <input type="checkbox" class="impresora-checkbox" value="${nombre}" ${seleccionadas.includes(nombre) ? "checked" : ""} onchange="renderImpresorasArchivos()">
          <span>${nombre}</span>
        </label>
      `).join("");
    });
    document.getElementById("impresorasCheckboxes").innerHTML = html;
  }

  renderLista();
}

window.renderImpresorasArchivos = function() {
  const seleccionadas = Array.from(document.querySelectorAll(".impresora-checkbox:checked")).map(cb => cb.value);
  const cont = document.getElementById("registroImpresorasArchivos");
  if (seleccionadas.length === 0) {
    cont.innerHTML = `<div style="color:var(--text-secondary);margin-top:18px;">Selecciona al menos una impresora.</div>`;
    return;
  }
  cont.innerHTML = seleccionadas.map(nombre => `
    <div style="margin-bottom:18px;padding:12px 8px;border:1px solid var(--border-color);border-radius:8px;">
      <b>${nombre}</b><br>
      Contador apertura: <input type="number" min="0" id="apertura_${nombre}" class="calc-input" style="margin-bottom:6px;width:120px;" oninput="calcularDiferenciaContador('${nombre}')"><br>
      Contador cierre: <input type="number" min="0" id="cierre_${nombre}" class="calc-input" style="width:120px;" oninput="calcularDiferenciaContador('${nombre}')"><br>
      Diferencia: <span id="diferencia_${nombre}" style="font-weight:600;color:#059669;">-</span>
    </div>
  `).join("");
};

function calcularDiferenciaContador(nombre) {
  const apertura = Number(document.getElementById(`apertura_${nombre}`).value) || 0;
  const cierre = Number(document.getElementById(`cierre_${nombre}`).value) || 0;
  const diferencia = (apertura > 0 || cierre > 0) ? (cierre - apertura) : "";
  document.getElementById(`diferencia_${nombre}`).textContent = diferencia !== "" ? diferencia : "-";
}



document.getElementById("btnBuscarImpresoras").onclick = async function() {
  const fecha = document.getElementById("filtroFechaImpresoras").value;
  const copiado = document.getElementById("filtroCopiadoImpresoras").value;
  const turno = document.getElementById("filtroTurnoImpresoras").value;
  mostrarRegistrosImpresoras(fecha, copiado, turno);
};

async function mostrarRegistrosImpresoras(fecha, copiado, turno) {
  const cont = document.getElementById("listaRegistroImpresoras");
  cont.innerHTML = "Cargando...";
  if (!window.firebaseInitialized || !window.firebaseDatabase) {
    cont.innerHTML = "Firebase no disponible.";
    return;
  }
  let registros = [];
  if (fecha) {
    const ref = window.firebaseRef(window.firebaseDatabase, `registro_impresoras/${fecha}`);
    const snap = await window.firebaseGet(ref);
    if (snap.exists()) {
      const data = snap.val();
      for (const cop in data) {
        if (copiado !== "todos" && cop !== copiado) continue;
        for (const tur in data[cop]) {
          if (turno !== "todos" && tur !== turno) continue;
          registros = registros.concat((data[cop][tur] || []).map(r => ({
            ...r, copiado: cop, turno: tur, fecha
          })));
        }
      }
    }
  } else {
    const ref = window.firebaseRef(window.firebaseDatabase, `registro_impresoras`);
    const snap = await window.firebaseGet(ref);
    if (snap.exists()) {
      const data = snap.val();
      Object.keys(data).reverse().slice(0,10).forEach(f => {
        for (const cop in data[f]) {
          if (copiado !== "todos" && cop !== copiado) continue;
          for (const tur in data[f][cop]) {
            if (turno !== "todos" && tur !== turno) continue;
            registros = registros.concat((data[f][cop][tur] || []).map(r => ({
              ...r, copiado: cop, turno: tur, fecha: f
            })));
          }
        }
      });
    }
  }
  if (registros.length === 0) {
    cont.innerHTML = `<div style="color:var(--text-secondary);padding:18px;">No hay registros para los filtros seleccionados.</div>`;
    return;
  }
    cont.innerHTML = `<div class="impresoras-grid">
    ${registros.map(r => `
      <div class="impresora-card">
        <div class="impresora-nombre">${r.nombre}</div>
        <div><b>Copiado:</b> ${r.copiado}</div>
        <div><b>Fecha:</b> ${r.fecha}</div>
        <div><b>Turno:</b> ${obtenerNombreTurno(r.turno)}</div>
        <div style="margin-top:8px;">
          <b>Apertura:</b> ${r.apertura}
          <br>
          <b>Cierre:</b> ${r.cierre}
          <br>
          <b>Diferencia:</b> <span style="color:${r.diferencia < 0 ? '#dc2626' : '#059669'};font-weight:600;">${r.diferencia}</span>
        </div>
      </div>
    `).join("")}
  </div>`;
}

document.getElementById("btnVerRegistroMesImpresoras").onclick = async function() {
  document.getElementById("modalVerRegistroMesImpresoras").style.display = "flex";
  const selMes = document.getElementById("mesRegistroImpresoras");
  selMes.innerHTML = "";
  if (!window.firebaseInitialized || !window.firebaseDatabase) return;
  const ref = window.firebaseRef(window.firebaseDatabase, `registro_impresoras`);
  const snap = await window.firebaseGet(ref);
  if (snap.exists()) {
    const meses = Object.keys(snap.val()).map(f => f.slice(0,7)).filter((v,i,a) => a.indexOf(v)===i);
    selMes.innerHTML = meses.map(m => `<option value="${m}">${m}</option>`).join("");
    if (meses.length > 0) selMes.value = meses[0];
    cargarTablaRegistroMes();
  }
};
document.getElementById("mesRegistroImpresoras").onchange = cargarTablaRegistroMes;
document.getElementById("copiadoRegistroImpresoras").onchange = cargarTablaRegistroMes;
document.getElementById("turnoRegistroImpresoras").onchange = cargarTablaRegistroMes;
document.getElementById("fechaRegistroImpresoras").onchange = cargarTablaRegistroMes;
document.getElementById("btnCerrarRegistroMesImpresoras").onclick = function() {
  document.getElementById("modalVerRegistroMesImpresoras").style.display = "none";
};

async function cargarTablaRegistroMes() {
  const mes = document.getElementById("mesRegistroImpresoras").value;
  const fechaFiltro = document.getElementById("fechaRegistroImpresoras").value;
  const copiado = document.getElementById("copiadoRegistroImpresoras").value;
  const turno = document.getElementById("turnoRegistroImpresoras").value;
  const tbody = document.querySelector("#tablaRegistroMesImpresoras tbody");
  tbody.innerHTML = "<tr><td colspan='7'>Cargando...</td></tr>";
  if (!window.firebaseInitialized || !window.firebaseDatabase) return;
  const ref = window.firebaseRef(window.firebaseDatabase, `registro_impresoras`);
  const snap = await window.firebaseGet(ref);
  let filas = [];
  if (snap.exists()) {
    const data = snap.val();
    Object.keys(data).forEach(fecha => {
      if (!fecha.startsWith(mes)) return;
      if (fechaFiltro && fecha !== fechaFiltro) return;
      Object.keys(data[fecha]).forEach(cop => {
        if (copiado !== "todos" && cop !== copiado) return;
        Object.keys(data[fecha][cop]).forEach(turn => {
          if (turno !== "todos" && turn !== turno) return;
          const impresoras = data[fecha][cop][turn];
          if (Array.isArray(impresoras)) {
            impresoras.forEach(imp => {
              filas.push({
                fecha,
                maquina: imp.nombre,
                copiado: cop,
                turno: turn,
                apertura: imp.apertura ?? "-",
                cierre: imp.cierre ?? "-",
                diferencia: (typeof imp.apertura === "number" && typeof imp.cierre === "number")
                  ? (imp.cierre - imp.apertura)
                  : "-"
              });
            });
          }
        });
      });
    });
  }
  if (filas.length === 0) {
    tbody.innerHTML = "<tr><td colspan='7'>No hay registros para este mes.</td></tr>";
    return;
  }
  tbody.innerHTML = filas.map(r => `
    <tr>
      <td>${r.fecha}</td>
      <td>${r.maquina}</td>
      <td>${r.copiado}</td>
      <td>${obtenerNombreTurno(r.turno)}</td>
      <td>${r.apertura}</td>
      <td>${r.cierre}</td>
      <td style="font-weight:600;color:${r.diferencia < 0 ? '#dc2626' : '#059669'};">${r.diferencia}</td>
    </tr>
  `).join("");
}

async function descargarPDFImpresora(maquina, fecha, copiado, turno, tipo, urlImagen) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Registro de ${tipo === "apertura" ? "Apertura" : "Cierre"} - ${maquina}`, 14, 18);
  doc.setFontSize(12);
  doc.text(`Fecha: ${fecha}`, 14, 28);
  doc.text(`Copiado: ${copiado}`, 14, 36);
  doc.text(`Turno: ${obtenerNombreTurno(turno)}`, 14, 44);

  try {
    const imgData = await getImageDataUrl(urlImagen);
    doc.addImage(imgData, 'JPEG', 15, 55, 180, 120);
  } catch (e) {
    doc.text("No se pudo cargar la imagen.", 14, 60);
  }

  doc.save(`Contador_${tipo}_${maquina}_${fecha}_${turno}.pdf`);
}

async function getImageDataUrl(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = function() {
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}


document.getElementById("btnReporteContadoresImpresoras").onclick = function() {
  document.getElementById("modalReporteContadoresImpresoras").style.display = "flex";
  const hoy = new Date();
  const hace7 = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  document.getElementById("reporteContadoresDesde").value = hace7.toISOString().slice(0,10);
  document.getElementById("reporteContadoresHasta").value = hoy.toISOString().slice(0,10);
  document.getElementById("tablaReporteContadoresImpresoras").innerHTML = "";
  document.getElementById("btnExportarReporteContadoresPDF").style.display = "none";
};

document.getElementById("btnCerrarReporteContadores").onclick = function() {
  document.getElementById("modalReporteContadoresImpresoras").style.display = "none";
};

document.getElementById("btnGenerarReporteContadores").onclick = async function() {
  const desde = document.getElementById("reporteContadoresDesde").value;
  const hasta = document.getElementById("reporteContadoresHasta").value;
  if (!desde || !hasta) {
    alert("Selecciona ambas fechas.");
    return;
  }
  document.getElementById("tablaReporteContadoresImpresoras").innerHTML = "Cargando...";
  const datos = await obtenerDatosContadoresImpresoras(desde, hasta);
  renderizarTablaContadores(datos, desde, hasta);
  document.getElementById("btnExportarReporteContadoresPDF").style.display = "inline-block";
  window._datosContadoresParaPDF = { datos, desde, hasta };
};

document.getElementById("btnExportarReporteContadoresPDF").onclick = function() {
  if (window._datosContadoresParaPDF) {
    exportarContadoresPDF(window._datosContadoresParaPDF.datos, window._datosContadoresParaPDF.desde, window._datosContadoresParaPDF.hasta);
  }
};

async function obtenerDatosContadoresImpresoras(desde, hasta) {
  const d1 = new Date(desde);
  const d2 = new Date(hasta);
  let fechas = [];
  for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
    fechas.push(d.toISOString().slice(0,10));
  }
  const copiados = ["ingenieria", "sociales", "salud", "becas_salud", "becas_ingenieria", "hec"];
  let resultado = {};
  for (const copiado of copiados) {
    resultado[copiado] = {};
  }
  for (const fecha of fechas) {
    const ref = window.firebaseRef(window.firebaseDatabase, `registro_impresoras/${fecha}`);
    const snap = await window.firebaseGet(ref);
    if (snap.exists()) {
      const porCopiado = snap.val();
      for (const copiado in porCopiado) {
        for (const turno in porCopiado[copiado]) {
          const lista = porCopiado[copiado][turno];
          for (const imp of lista) {
            const key = imp.nombre || imp.maquina || imp.marca || "Desconocida";
            if (!resultado[copiado][key]) {
              resultado[copiado][key] = {
                marca: imp.marca || "",
                nombre: imp.nombre || key,
                apertura: imp.apertura,
                cierre: imp.cierre,
                diferencia: (imp.cierre ?? 0) - (imp.apertura ?? 0),
                color: /color/i.test((imp.nombre||"")) || /color/i.test((imp.marca||"")) ? true : false,
                bn: !(/color/i.test((imp.nombre||"")) || /color/i.test((imp.marca||""))),
                detalles: []
              };
            } else {
              resultado[copiado][key].diferencia += (imp.cierre ?? 0) - (imp.apertura ?? 0);
              if (imp.cierre > resultado[copiado][key].cierre) resultado[copiado][key].cierre = imp.cierre;
              if (imp.apertura < resultado[copiado][key].apertura) resultado[copiado][key].apertura = imp.apertura;
            }
            resultado[copiado][key].detalles.push({
              fecha, turno, apertura: imp.apertura, cierre: imp.cierre
            });
          }
        }
      }
    }
  }
  return resultado;
}

function renderizarTablaContadores(datos, desde, hasta) {
  let html = `<div class="reporte-contadores-periodo"><b>Periodo:</b> ${formatearFecha(desde)} al ${formatearFecha(hasta)}</div>`;
  let totalGeneral = 0;

  let preciosPorImpresora = {};

  for (const copiado in datos) {
    const impresoras = datos[copiado];
    if (Object.keys(impresoras).length === 0) continue;

    html += `<div class="reporte-contadores-copiado-title" style="margin-top:32px;margin-bottom:8px;">${copiado.charAt(0).toUpperCase() + copiado.slice(1).replace("_"," ")}</div>`;
    html += `<div style="overflow-x:auto;"><table class="reporte-contadores-table" style="width:100%;border-collapse:separate;border-spacing:0;background:var(--bg-card-header);border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,0.08);margin-bottom:18px;">
      <thead>
        <tr>
          <th style="background:#3b82f6;color:#fff;font-weight:700;font-size:1.08rem;">Marca</th>
          <th style="background:#3b82f6;color:#fff;font-weight:700;font-size:1.08rem;">Nombre</th>
          <th style="background:#3b82f6;color:#fff;font-weight:700;font-size:1.08rem;">Contador inicial</th>
          <th style="background:#3b82f6;color:#fff;font-weight:700;font-size:1.08rem;">Contador final</th>
          <th style="background:#3b82f6;color:#fff;font-weight:700;font-size:1.08rem;">Contadores totales</th>
          <th style="background:#3b82f6;color:#fff;font-weight:700;font-size:1.08rem;">Precio</th>
          <th style="background:#3b82f6;color:#fff;font-weight:700;font-size:1.08rem;">Precio final</th>
        </tr>
      </thead>
      <tbody>`;

    let subtotal = 0;
    let rowIndex = 0;
    for (const key in impresoras) {
      const imp = impresoras[key];
      let precioDefault = imp.nombre && imp.nombre.toUpperCase().includes("COLOR") ? 115 : 40;
      const precioActual = preciosPorImpresora[imp.nombre] !== undefined ? preciosPorImpresora[imp.nombre] : precioDefault;
      const precioFinal = imp.diferencia * precioActual;
      subtotal += precioFinal;

    html += `
      <tr>
        <td>-</td>
        <td>${imp.nombre}</td>
        <td>${imp.apertura}</td>
        <td>${imp.cierre}</td>
        <td>${imp.diferencia}</td>
        <td>
          <input type="number" min="0" step="1" value="${precioActual}" 
            data-impresora="${imp.nombre}" 
            class="input-precio-contador"
            style="text-align:right;"
            onchange="actualizarPrecioImpresora('${copiado}','${imp.nombre}',this.value)">
        </td>
        <td id="precioFinal_${copiado}_${rowIndex}" style="font-weight:600;">$${precioFinal.toLocaleString("es-AR")}</td>
      </tr>
    `;
    rowIndex++;
  }
    html += `<tr class="reporte-contadores-total-row">
      <td colspan="6" style="text-align:right;background:#d1fae5;color:#059669;font-weight:700;">Total ${copiado}:</td>
      <td style="background:#d1fae5;color:#059669;font-weight:700;" id="subtotal_${copiado}">$${subtotal.toLocaleString("es-AR")}</td>
    </tr>`;
    html += `</tbody></table></div>`;
    totalGeneral += subtotal;
  }
  html += `<div class="reporte-contadores-total-general" style="font-weight:800;font-size:1.18rem;margin-top:18px;color:#059669;text-align:right;">Total general a pagar: <span id="totalGeneralContadores">$${totalGeneral.toLocaleString("es-AR")}</span></div>`;
  document.getElementById("tablaReporteContadoresImpresoras").innerHTML = html;

  window._contadoresDatosTabla = datos;
  window._contadoresPreciosPorImpresora = preciosPorImpresora;
}

window.actualizarPrecioImpresora = function(copiado, nombre, nuevoPrecio) {
  const datos = window._contadoresDatosTabla;
  const precios = window._contadoresPreciosPorImpresora;
  let subtotal = 0;
  let rowIndex = 0;
  for (const key in datos[copiado]) {
    const imp = datos[copiado][key];
    if (imp.nombre === nombre) {
      precios[imp.nombre] = Number(nuevoPrecio);
    }
    const precioUsar = precios[imp.nombre] !== undefined ? precios[imp.nombre] : (imp.nombre.toLowerCase().includes("color") ? 115 : 40);
    const precioFinal = imp.diferencia * precioUsar;
    document.getElementById(`precioFinal_${copiado}_${rowIndex}`).textContent = `$${precioFinal.toLocaleString("es-AR")}`;
    subtotal += precioFinal;
    rowIndex++;
  }
  document.getElementById(`subtotal_${copiado}`).textContent = `$${subtotal.toLocaleString("es-AR")}`;

  let totalGeneral = 0;
  for (const cop in datos) {
    let sub = 0;
    let idx = 0;
    for (const key in datos[cop]) {
      const imp = datos[cop][key];
      const precioUsar = precios[imp.nombre] !== undefined ? precios[imp.nombre] : (imp.nombre.toLowerCase().includes("color") ? 115 : 40);
      sub += imp.diferencia * precioUsar;
      idx++;
    }
    totalGeneral += sub;
    if (document.getElementById(`subtotal_${cop}`))
      document.getElementById(`subtotal_${cop}`).textContent = `$${sub.toLocaleString("es-AR")}`;
  }
  if (document.getElementById("totalGeneralContadores"))
    document.getElementById("totalGeneralContadores").textContent = `$${totalGeneral.toLocaleString("es-AR")}`;
};


function exportarContadoresPDF(datos, desde, hasta) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });
  let y = 14;
  doc.setFontSize(16);
  doc.text(`Reporte de contadores de impresoras`, 14, y);
  y += 8;
  doc.setFontSize(12);
  doc.text(`Periodo: ${formatearFecha(desde)} al ${formatearFecha(hasta)}`, 14, y);
  y += 8;
  const precioBN = 40, precioColor = 115;
  let totalGeneral = 0;
  for (const copiado in datos) {
    const impresoras = datos[copiado];
    if (Object.keys(impresoras).length === 0) continue;
    y += 10;
    doc.setFontSize(13);
    doc.text(`${copiado.charAt(0).toUpperCase() + copiado.slice(1).replace("_"," ")}`, 14, y);
    y += 4;
    const rows = [];
    let subtotal = 0;
    for (const key in impresoras) {
      const imp = impresoras[key];
      const precio = imp.color ? precioColor : precioBN;
      const precioFinal = imp.diferencia * precio;
      subtotal += precioFinal;
      rows.push([
        imp.marca || "-", imp.nombre || key, imp.apertura ?? "-", imp.cierre ?? "-", imp.diferencia, `$${precio}`, `$${precioFinal.toLocaleString("es-AR")}`
      ]);
    }
    rows.push([
      { content: "Total " + copiado, colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: `$${subtotal.toLocaleString("es-AR")}`, styles: { fontStyle: 'bold', fillColor: [209,250,229] } }
    ]);
    doc.autoTable({
      head: [["Marca", "Nombre", "Contador inicial", "Contador final", "Contadores totales", "Precio", "Precio final"]],
      body: rows,
      startY: y + 2,
      theme: 'grid',
      styles: { fontSize: 11 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { fillColor: [245, 245, 245] }
    });
    y = doc.lastAutoTable.finalY;
    totalGeneral += subtotal;
  }
  y += 10;
  doc.setFontSize(14);
  doc.text(`Total general a pagar: $${totalGeneral.toLocaleString("es-AR")}`, 14, y);
  doc.save(`Reporte_Contadores_Impresoras_${desde}_a_${hasta}.pdf`);
}

function formatearFecha(fecha) {
  if (!fecha) return "";
  const [y,m,d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

document.getElementById("btnLimpiarRegistroMesImpresoras").onclick = async function() {
  const mes = document.getElementById("mesRegistroImpresoras").value;
  if (!mes) {
    alert("Selecciona un mes.");
    return;
  }
  if (!window.firebaseInitialized || !window.firebaseDatabase) {
    alert("Firebase no disponible.");
    return;
  }
  if (!confirm(`¿Seguro que deseas borrar TODOS los registros del mes ${mes}? Esta acción no se puede deshacer.`)) return;
  const ref = window.firebaseRef(window.firebaseDatabase, `registro_impresoras`);
  const snap = await window.firebaseGet(ref);
  if (snap.exists()) {
    const data = snap.val();
    const updates = {};
    Object.keys(data).forEach(fecha => {
      if (fecha.startsWith(mes)) {
        updates[fecha] = null;
      }
    });
    await window.firebaseSet(ref, { ...data, ...updates });
    alert("Registros del mes eliminados correctamente.");
    cargarTablaRegistroMes();
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const btnMenu = document.getElementById("btnMenuHamburguesa");
  const panel = document.getElementById("menuLateralPanel");
  const btnCerrar = document.getElementById("btnCerrarMenuLateral");

  if (btnMenu && panel && btnCerrar) {
    btnMenu.onclick = function() {
      panel.classList.add("abierto");
      document.body.classList.add("overflow-hidden");
    };
    btnCerrar.onclick = function() {
      panel.classList.remove("abierto");
      document.body.classList.remove("overflow-hidden");
    };
    panel.onclick = function(e) {
      if (e.target === panel) {
        panel.classList.remove("abierto");
        document.body.classList.remove("overflow-hidden");
      }
    };
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const btnMenu = document.getElementById("btnMenuHamburguesa");
  const panel = document.getElementById("menuLateralPanel");
  const btnCerrar = document.getElementById("btnCerrarMenuLateral");
  const overlay = document.getElementById("menuLateralOverlay");
  const btnCambiarTema = document.getElementById("btnCambiarTemaLateral");

  function abrirMenuLateral() {
    panel.classList.add("abierto");
    document.body.classList.add("overflow-hidden");
    if (btnMenu) btnMenu.classList.add("oculto");
    if (overlay) overlay.style.display = "block";
  }
  
  function cerrarMenuLateral() {
    panel.classList.remove("abierto");
    document.body.classList.remove("overflow-hidden");
    if (overlay) overlay.style.display = "none";
    btnMenu.classList.remove("oculto");
    if (btnMenu) {
      setTimeout(() => {
        btnMenu.classList.remove("oculto");
        btnMenu.classList.add("fade-in");
        setTimeout(() => {
          btnMenu.classList.remove("fade-in");
        }, 500);
      }, 300);
    }
  }

  if (btnMenu && panel && btnCerrar && overlay) {
    btnMenu.onclick = abrirMenuLateral;
    btnCerrar.onclick = cerrarMenuLateral;
    overlay.onclick = cerrarMenuLateral;
    panel.addEventListener("click", function(e) {
      if (e.target === panel) cerrarMenuLateral();
    });
    document.addEventListener("keydown", function(e) {
      if (panel.classList.contains("abierto") && e.key === "Escape") cerrarMenuLateral();
    });
    panel.querySelectorAll("button, a").forEach(el => {
      el.onclick = function(e) {
        cerrarMenuLateral();
        if (el.id === "btnRegistrarImpresoras") {
          document.getElementById("modalRegistroImpresoras").style.display = "flex";
          document.getElementById("registroFecha").value = new Date().toISOString().slice(0,10);
          renderImpresorasCheckbox();
          renderImpresorasArchivos();
        }
        if (el.id === "btnReportesSugerencias") {
          document.getElementById("modalReportesSugerencias").style.display = "flex";
          document.getElementById("reportNombre").value = "";
          document.getElementById("reportDescripcion").value = "";
          document.getElementById("msgReporte").textContent = "";
        }
        if (el.id === "btnCambiarTemaLateral") {
          calcToggleTheme();
        }
      };
    });
  }
});

function mostrarModalAnimado(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.style.display = "flex";
  modal.classList.remove("animated-fadeOutDown", "animating");
  modal.classList.add("animated-fadeInUp", "animating");
  setTimeout(() => {
    modal.classList.remove("animated-fadeInUp", "animating");
  }, 500);
}

function mostrarModalAnimado(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.style.display = "flex";
  modal.classList.remove("animated-fadeOut", "animating");
  modal.classList.add("animated-fadeIn", "animating");
  setTimeout(() => {
    modal.classList.remove("animated-fadeIn", "animating");
  }, 400);
}

function ocultarModalAnimado(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal || modal.style.display === "none") return;
  modal.classList.remove("animated-fadeIn", "animating");
  modal.classList.add("animated-fadeOut", "animating");
  setTimeout(() => {
    modal.style.display = "none";
    modal.classList.remove("animated-fadeOut", "animating");
  }, 300);
}

document.getElementById("btnRegistrarImpresoras").onclick = function() {
  mostrarModalAnimado("modalRegistroImpresoras");
  document.getElementById("registroFecha").value = new Date().toISOString().slice(0,10);
  renderImpresorasCheckbox();
  renderImpresorasArchivos();
};
document.getElementById("btnCancelarRegistroImpresoras").onclick = function() {
  ocultarModalAnimado("modalRegistroImpresoras");
};

document.getElementById("btnReportesSugerencias").onclick = function() {
  mostrarModalAnimado("modalReportesSugerencias");
  document.getElementById("reportNombre").value = "";
  document.getElementById("reportDescripcion").value = "";
  document.getElementById("msgReporte").textContent = "";
};
document.getElementById("btnCancelarReporte").onclick = function() {
  ocultarModalAnimado("modalReportesSugerencias");
};


function calcActualizarComparativa() {
  calcMostrarComparativa();
}

document.addEventListener("DOMContentLoaded", () => {

  const btnExportarEstadisticas = document.querySelector('button[title="Exportar estadísticas a PDF"]');
  if (btnExportarEstadisticas) {
    btnExportarEstadisticas.onclick = calcExportarEstadisticasPDF;
  }

  const btnActualizarComparativa = document.querySelector('button[title="Actualizar datos"]');
  if (btnActualizarComparativa) {
    btnActualizarComparativa.onclick = calcActualizarComparativa;
  }
});

function calcExportarEstadisticasPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text("Comparativa por Fotocopiado - Estadísticas", 14, 18);

  doc.setFontSize(12);
  doc.text(`Total General: ${document.getElementById("calcTotalGeneralComp").textContent}`, 14, 28);
  doc.text(`Fotocopiado Líder: ${document.getElementById("calcInstitutoLider").textContent}`, 14, 36);
  doc.text(`Ventas Totales: ${document.getElementById("calcVentasTotales").textContent}`, 14, 44);

  let y = 54;

  const canvasIngresos = document.getElementById("calcChartIngresos");
  if (canvasIngresos) {
    const imgIngresos = canvasIngresos.toDataURL("image/png", 1.0);
    doc.setFontSize(13);
    doc.text("Ingresos por Fotocopiados", 14, y);
    y += 6;
    doc.addImage(imgIngresos, "PNG", 14, y, 180, 60);
    y += 65;
  }

  const canvasMetodos = document.getElementById("calcChartMetodos");
  if (canvasMetodos) {
    const imgMetodos = canvasMetodos.toDataURL("image/png", 1.0);
    doc.setFontSize(13);
    doc.text("Métodos de Pago", 14, y);
    y += 6;
    doc.addImage(imgMetodos, "PNG", 14, y, 180, 60);
    y += 65;
  }

  doc.setFontSize(13);
  doc.text("Detalles por Fotocopiado", 14, y);
  y += 8;

  const cards = document.querySelectorAll("#calcDetallesGrid .calc-detail-card");
  const tabla = [];
  cards.forEach(card => {
    const nombre = card.querySelector("h4").textContent;
    const stats = Array.from(card.querySelectorAll(".calc-detail-stat")).map(stat => {
      const spans = stat.querySelectorAll("span");
      return [spans[0].textContent, spans[1].textContent];
    });
    tabla.push([nombre, ...stats.map(s => `${s[0]} ${s[1]}`)]);
  });

  doc.autoTable({
    head: [["Fotocopiado", "Total de Ingresos", "Ventas en Efectivo", "Ventas por Transferencia", "Número de Ventas", "Promedio por Venta", "Pérdidas", "Extras"]],
    body: tabla,
    startY: y,
    theme: 'grid',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
    bodyStyles: { fillColor: [245, 245, 245] }
  });

  doc.save("Estadisticas_Comparativa_Fotocopiados.pdf");
}

function mostrarModalLimpiarBaseDatos() {
    document.getElementById("modalLimpiarBaseDatos").style.display = "flex";
    document.getElementById("inputPasswordLimpiarBD").value = "";
    document.getElementById("msgLimpiarBD").textContent = "";
    setTimeout(() => {
        document.getElementById("inputPasswordLimpiarBD").focus();
    }, 100);
}

document.getElementById("btnCancelarLimpiarBD").onclick = function() {
    document.getElementById("modalLimpiarBaseDatos").style.display = "none";
};

document.getElementById("btnConfirmarLimpiarBD").onclick = async function() {
  const pass = document.getElementById("inputPasswordLimpiarBD").value;
  const msg = document.getElementById("msgLimpiarBD");
  if (!contrasenasDinamicas) await cargarContrasenasDinamicas();
  const passAdmin = contrasenasDinamicas?.admin || "admin123";
  if (pass !== passAdmin) {
    msg.textContent = "Contraseña incorrecta.";
    return;
  }
  if (!window.firebaseInitialized || !window.firebaseDatabase) {
    msg.textContent = "Firebase no disponible.";
    return;
  }
  if (!confirm("¿Seguro que deseas borrar TODA la base de datos? Esta acción no se puede deshacer.")) return;
  try {
    const db = window.firebaseDatabase;
    const refRoot = window.firebaseRef(db, "/");
    await window.firebaseSet(refRoot, null);
    msg.textContent = "Base de datos limpiada correctamente.";
    setTimeout(() => {
      document.getElementById("modalLimpiarBaseDatos").style.display = "none";
    }, 1200);
  } catch (e) {
    msg.textContent = "Error al limpiar la base de datos.";
  }
};

document.getElementById("inputPasswordLimpiarBD").addEventListener("keydown", function(e) {
    if (e.key === "Enter") document.getElementById("btnConfirmarLimpiarBD").click();
});

document.addEventListener("DOMContentLoaded", () => {
    const btnMenu = document.getElementById("btnMenuHamburguesa");
    const panel = document.getElementById("menuLateralPanel");
    const btnCerrar = document.getElementById("btnCerrarMenuLateral");
    const overlay = document.getElementById("menuLateralOverlay");
    const btnCambiarTema = document.getElementById("btnCambiarTemaLateral");

    function abrirMenuLateral() {
        panel.classList.add("abierto");
        document.body.classList.add("overflow-hidden");
        if (btnMenu) btnMenu.classList.add("oculto");
        if (overlay) overlay.style.display = "block";
    }
    
    function cerrarMenuLateral() {
        panel.classList.remove("abierto");
        document.body.classList.remove("overflow-hidden");
        if (overlay) overlay.style.display = "none";
        if (btnMenu) {
            setTimeout(() => {
                btnMenu.classList.remove("oculto");
                btnMenu.classList.add("fade-in");
                setTimeout(() => {
                    btnMenu.classList.remove("fade-in");
                }, 500);
            }, 300);
        }
    }

    if (btnMenu && panel && btnCerrar && overlay) {
        btnMenu.onclick = abrirMenuLateral;
        btnCerrar.onclick = cerrarMenuLateral;
        overlay.onclick = cerrarMenuLateral;
        panel.addEventListener("click", function(e) {
            if (e.target === panel) cerrarMenuLateral();
        });
        document.addEventListener("keydown", function(e) {
            if (panel.classList.contains("abierto") && e.key === "Escape") cerrarMenuLateral();
        });
        panel.querySelectorAll("button, a").forEach(el => {
            el.onclick = function(e) {
                cerrarMenuLateral();
                if (el.id === "btnRegistrarImpresoras") {
                    setTimeout(() => {
                        document.getElementById("modalRegistroImpresoras").style.display = "flex";
                        document.getElementById("registroFecha").value = new Date().toISOString().slice(0,10);
                        renderImpresorasCheckbox();
                        renderImpresorasArchivos();
                    }, 350);
                }
                if (el.id === "btnReportesSugerencias") {
                    setTimeout(() => {
                        document.getElementById("modalReportesSugerencias").style.display = "flex";
                        document.getElementById("reportNombre").value = "";
                        document.getElementById("reportDescripcion").value = "";
                        document.getElementById("msgReporte").textContent = "";
                    }, 350);
                }
                if (el.id === "btnCambiarTemaLateral") {
                    calcToggleTheme();
                }
                if (el.id === "btnEstadisticasLogin") {
                    setTimeout(() => {
                        document.getElementById("modalEstadisticasAdmin").style.display = "flex";
                        document.getElementById("inputPasswordEstadisticas").value = "";
                        document.getElementById("msgEstadisticasAdmin").textContent = "";
                        setTimeout(() => {
                            document.getElementById("inputPasswordEstadisticas").focus();
                        }, 100);
                    }, 350);
                }
            };
        });
    }
});

window.irAlRegistroCopiado = function(copiado) {
  const loader = document.getElementById("loaderUNAJ");
  const logo = document.getElementById("loaderUNAJLogo");
  const textos = document.querySelector(".loader-textos");
  if (loader && logo && textos) {
    loader.style.display = "flex";
    loader.classList.remove("loader-hide");
    
    logo.classList.remove("loader-fade-in", "loader-fade-out");
    textos.classList.remove("loader-fade-in", "loader-fade-out");
    
    void logo.offsetWidth;
    void textos.offsetWidth;
    logo.classList.add("loader-fade-in");
    textos.classList.add("loader-fade-in");
    setTimeout(() => {
      logo.classList.remove("loader-fade-in");
      textos.classList.remove("loader-fade-in");
      logo.classList.add("loader-fade-out");
      textos.classList.add("loader-fade-out");
      setTimeout(() => {
        loader.classList.add("loader-hide");
        setTimeout(() => {
          loader.style.display = "none";
          logo.classList.remove("loader-fade-out");
          textos.classList.remove("loader-fade-out");
        }, 700);
      }, 700);
    }, 900);
  }

  currentFotocopiado = copiado;
  localStorage.setItem("currentFotocopiado", copiado);

  setTimeout(() => {
    document.getElementById("calcComparativaScreen").style.display = "none";
    document.getElementById("calculatorScreen").style.display = "block";
    document.getElementById("turnoSelectorFixed").style.display = "flex";

    showSyncNotification("Cargando datos del registro seleccionado...");
    loadFromFirebase().then(() => {
      calcActualizarTabla();
      setTimeout(() => {
        const card = document.querySelector(".calc-card");
        if (card) card.scrollIntoView({ behavior: "smooth" });
      }, 300);
    });

    const fotocopiado = calcInstitutos[copiado];
    if (fotocopiado) {
      document.getElementById("fotocopiadoTitle").textContent = fotocopiado.name;
      document.getElementById("fotocopiadoSubtitle").textContent = fotocopiado.fullName;
    }
  }, 900);
};

document.addEventListener("DOMContentLoaded", function() {
    const btnLeft = document.getElementById("btnScrollLeftDetalles");
    const btnRight = document.getElementById("btnScrollRightDetalles");
    const grid = document.getElementById("calcDetallesGrid");
    if (btnLeft && btnRight && grid) {
        btnLeft.onclick = function() {
            grid.scrollBy({ left: -340, behavior: "smooth" });
        };
        btnRight.onclick = function() {
            grid.scrollBy({ left: 340, behavior: "smooth" });
        };
    }
});

document.getElementById("btnExportarRegistroMesImpresorasPDF").onclick = async function() {
  const mes = document.getElementById("mesRegistroImpresoras").value;
  const fechaFiltro = document.getElementById("fechaRegistroImpresoras").value;
  const copiado = document.getElementById("copiadoRegistroImpresoras").value;
  const turno = document.getElementById("turnoRegistroImpresoras").value;

  const tbody = document.querySelector("#tablaRegistroMesImpresoras tbody");
  const filas = Array.from(tbody.querySelectorAll("tr")).map(tr => {
    const tds = tr.querySelectorAll("td");
    return {
      fecha: tds[0]?.textContent || "",
      maquina: tds[1]?.textContent || "",
      copiado: tds[2]?.textContent || "",
      turno: tds[3]?.textContent || "",
      apertura: tds[4]?.textContent || "",
      cierre: tds[5]?.textContent || "",
      diferencia: tds[6]?.textContent || ""
    };
  });

  if (filas.length === 0) {
    alert("No hay datos para exportar.");
    return;
  }

  const agrupado = {};
  filas.forEach(f => {
    if (!agrupado[f.turno]) agrupado[f.turno] = {};
    if (!agrupado[f.turno][f.fecha]) agrupado[f.turno][f.fecha] = [];
    agrupado[f.turno][f.fecha].push(f);
  });

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(16);
  doc.text(`Registro de contadores de impresoras`, 14, 18);
  doc.setFontSize(12);
  doc.text(`Mes: ${mes}`, 14, 26);
  let y = 34;
  if (fechaFiltro) { doc.text(`Filtro por fecha: ${fechaFiltro}`, 14, y); y += 8; }
  if (copiado && copiado !== "todos") { doc.text(`Copiado: ${copiado}`, 14, y); y += 8; }
  if (turno && turno !== "todos") { doc.text(`Turno: ${obtenerNombreTurno(turno)}`, 14, y); y += 8; }

  const ordenTurnos = ["Mañana", "Tarde", "Turno único"];
  const clavesTurnos = Object.keys(agrupado);

  ordenTurnos.forEach(turnoNombre => {
    const claveTurno = clavesTurnos.find(t => t === turnoNombre);
    if (!claveTurno) return;

    y += 10;
    doc.setFontSize(14);
    doc.text(`Turno: ${turnoNombre}`, 14, y);
    y += 6;

    const fechas = Object.keys(agrupado[claveTurno]).sort();
    fechas.forEach(fecha => {
      y += 8;
      doc.setFontSize(12);
      doc.text(`Fecha: ${fecha}`, 14, y);
      y += 4;

      const tabla = agrupado[claveTurno][fecha].map(f => [
        f.maquina,
        f.copiado,
        f.apertura,
        f.cierre,
        f.diferencia
      ]);

      doc.autoTable({
        head: [['Maquina', 'Copiado', 'Apertura', 'Cierre', 'Diferencia']],
        body: tabla,
        startY: y,
        theme: 'grid',
        styles: { fontSize: 11 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fillColor: [245, 245, 245] }
      });
      y = doc.lastAutoTable.finalY + 2;
    });
  });

  doc.save(`Registro_Contadores_Impresoras_${mes}.pdf`);
};

async function cargarContrasenasPanel() {
  const msg = document.getElementById("msgCambiarContrasenas");
  msg.textContent = "";
  if (window.firebaseInitialized && window.firebaseDatabase) {
    const ref = window.firebaseRef(window.firebaseDatabase, "contrasenas");
    const snap = await window.firebaseGet(ref);
    if (snap.exists()) {
      const data = snap.val();
      document.getElementById("passSalud").value = data?.salud || "";
      document.getElementById("passSociales").value = data?.sociales || "";
      document.getElementById("passIngenieria").value = data?.ingenieria || "";
      document.getElementById("passHEC").value = data?.hec_salud || "";
      document.getElementById("passAdmin").value = data?.admin || "";
    }
  } else {
    document.getElementById("passSalud").value = localStorage.getItem("passSalud") || "";
    document.getElementById("passSociales").value = localStorage.getItem("passSociales") || "";
    document.getElementById("passIngenieria").value = localStorage.getItem("passIngenieria") || "";
    document.getElementById("passHEC").value = localStorage.getItem("passHEC") || "";
    document.getElementById("passAdmin").value = localStorage.getItem("passAdmin") || "";
  }
}

document.getElementById("formCambiarContrasenas").onsubmit = async function(e) {
  e.preventDefault();
  const msg = document.getElementById("msgCambiarContrasenas");
  msg.textContent = "";
  msg.style.color = "#ef4444";

  if (!contrasenasDinamicas) await cargarContrasenasDinamicas();

  const actual = {
    salud: document.getElementById("passSaludActual").value.trim(),
    sociales: document.getElementById("passSocialesActual").value.trim(),
    ingenieria: document.getElementById("passIngenieriaActual").value.trim(),
    hec_salud: document.getElementById("passHECActual").value.trim(),
    admin: document.getElementById("passAdminActual").value.trim()
  };
  const nueva = {
    salud: document.getElementById("passSaludNueva").value.trim(),
    sociales: document.getElementById("passSocialesNueva").value.trim(),
    ingenieria: document.getElementById("passIngenieriaNueva").value.trim(),
    hec_salud: document.getElementById("passHECNueva").value.trim(),
    admin: document.getElementById("passAdminNueva").value.trim()
  };

  for (const key of Object.keys(actual)) {
    if ((actual[key] || nueva[key]) && (!actual[key] || !nueva[key])) {
      msg.textContent = "Debes ingresar la contraseña actual y la nueva para cada campo que quieras cambiar.";
      return;
    }
  }

  for (const key of Object.keys(actual)) {
    if (actual[key] && nueva[key]) {
      const actualCorrecta = contrasenasDinamicas?.[key]?.actual || (
        key === "salud" ? "salud123" :
        key === "sociales" ? "sociales123" :
        key === "ingenieria" ? "ingenieria123" :
        key === "hec_salud" ? "hec123" :
        key === "admin" ? "admin123" : ""
      );
      if (actual[key] !== actualCorrecta) {
        msg.textContent = `La contraseña actual de ${key === "hec_salud" ? "HEC Salud" : key.charAt(0).toUpperCase() + key.slice(1)} es incorrecta.`;
        return;
      }
    }
  }

  if (!Object.values(nueva).some(v => v)) {
    msg.textContent = "No hay cambios para guardar.";
    return;
  }

  const nuevasContrasenas = { ...contrasenasDinamicas };
  for (const key of Object.keys(nueva)) {
    if (actual[key] && nueva[key]) {
      nuevasContrasenas[key] = {
        actual: nueva[key],
        anterior: contrasenasDinamicas[key]?.actual || (
          key === "salud" ? "salud123" :
          key === "sociales" ? "sociales123" :
          key === "ingenieria" ? "ingenieria123" :
          key === "hec_salud" ? "hec123" :
          key === "admin" ? "admin123" : ""
        )
      };
    }
  }

  if (window.firebaseInitialized && window.firebaseDatabase) {
    const ref = window.firebaseRef(window.firebaseDatabase, "contrasenas");
    await window.firebaseSet(ref, nuevasContrasenas);
    msg.textContent = "Contraseñas actualizadas correctamente.";
    msg.style.color = "#059669";
  } else {
    for (const key of Object.keys(nueva)) {
      if (actual[key] && nueva[key]) {
        localStorage.setItem(
          key === "hec_salud" ? "passHEC" : "pass" + key.charAt(0).toUpperCase() + key.slice(1),
          JSON.stringify({
            actual: nueva[key],
            anterior: contrasenasDinamicas[key]?.actual || (
              key === "salud" ? "salud123" :
              key === "sociales" ? "sociales123" :
              key === "ingenieria" ? "ingenieria123" :
              key === "hec_salud" ? "hec123" :
              key === "admin" ? "admin123" : ""
            )
          })
        );
      }
    }
    msg.textContent = "Contraseñas guardadas localmente.";
    msg.style.color = "#059669";
  }

  for (const key of Object.keys(actual)) {
    document.getElementById("pass" + (key === "hec_salud" ? "HEC" : key.charAt(0).toUpperCase() + key.slice(1)) + "Actual").value = "";
    document.getElementById("pass" + (key === "hec_salud" ? "HEC" : key.charAt(0).toUpperCase() + key.slice(1)) + "Nueva").value = "";
  }

  await cargarContrasenasDinamicas();
  mostrarContrasenasEnCard();
};

document.getElementById("btnCancelarCambiarContrasenas").onclick = function() {
  [
    "passSaludActual", "passSaludNueva",
    "passSocialesActual", "passSocialesNueva",
    "passIngenieriaActual", "passIngenieriaNueva",
    "passHECActual", "passHECNueva",
    "passAdminActual", "passAdminNueva"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("msgCambiarContrasenas").textContent = "";
};

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("cardCambiarContrasenas")) {
    cargarContrasenasPanel();
  }
});

function mostrarContrasenasEnCard() {
  if (!contrasenasDinamicas) return;
  const map = {
    salud: "Salud",
    sociales: "Sociales",
    ingenieria: "Ingeniería",
    hec_salud: "HEC Salud",
    admin: "Administrador"
  };
  for (const key of Object.keys(map)) {
    const actual = contrasenasDinamicas[key]?.actual || (
      key === "salud" ? "salud123" :
      key === "sociales" ? "sociales123" :
      key === "ingenieria" ? "ingenieria123" :
      key === "hec_salud" ? "hec123" :
      key === "admin" ? "admin123" : ""
    );
    const anterior = contrasenasDinamicas[key]?.anterior || "";
    const el = document.getElementById("verPass" + (key === "hec_salud" ? "HEC" : key.charAt(0).toUpperCase() + key.slice(1)));
    if (el) {
      el.innerHTML = `
        <span style="font-size:0.98em;color:#059669;">Actual: <b>${actual}</b></span><br>
        <span style="font-size:0.95em;color:#64748b;">Anterior: <b>${anterior ? anterior : "(sin cambios previos)"}</b></span>
      `;
    }
  }
}

const btnCancelarEstadisticas = document.getElementById("btnCancelarEstadisticas");
if (btnCancelarEstadisticas) {
  btnCancelarEstadisticas.onclick = function() {
    document.getElementById("modalEstadisticasAdmin").style.display = "none";
    const loginScreen = document.getElementById("loginScreen");
    const btnMenu = document.getElementById("btnMenuHamburguesa");
    if (loginScreen && loginScreen.style.display !== "none" && btnMenu) {
      btnMenu.classList.remove("oculto");
    }
  };
}

document.addEventListener("DOMContentLoaded", function() {
  const wrapper = document.getElementById("cardCambiarContrasenasWrapper");
  const explicacion = document.getElementById("contrasenasExplicacion");
  const explicacionTexto = document.getElementById("contrasenasExplicacionTexto");
  const btn = document.getElementById("btnDesplegarContrasenas");
  const card = document.getElementById("cardCambiarContrasenas");

  if (btn && wrapper && card && explicacion) {
    btn.onclick = function() {
      wrapper.classList.add("desplegado");
      wrapper.classList.remove("blur-sensible");
      card.classList.remove("oculto");
      card.classList.add("visible");
      btn.style.display = "none";
      if (explicacionTexto) explicacionTexto.style.display = "none";
    };
  }
});