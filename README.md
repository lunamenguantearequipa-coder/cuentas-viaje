# Cuentas Hermanizzz

App para registrar los gastos del viaje familiar y saber quién le debe a quién.

- **Resumen**: tu saldo y de dónde sale, cómo quedar a mano, una sugerencia y en qué se fue la plata.
- **Registrar**: gastos (con 6 formas de dividir) y pagos entre hermanas.
- **Movimientos**: buscar, filtrar, editar y borrar.
- **Viaje**: agenda de vuelos, hospedajes y tours con fecha, hora y códigos de reserva; aviso de check-in pendiente; fotos de los pases (guardadas en Supabase Storage, privadas).
- **Personas**: saldo de cada una y porcentajes de quién cubre a papá y mamá (pueden ser distintos para comidas, tours y traslados).
- **Ajustes** (tocando tu inicial arriba): tope de hospedaje por noche, tipo de cambio y código para invitar.
- **?**: guía rápida de cómo funcionan las cuentas.

## Cómo funciona el reparto

- Cada hermana paga su parte.
- La parte de las personas "cubiertas" (papá y mamá) se reparte según sus porcentajes (50% Andrea, 25% Camila, 25% Adriana).
- **Hospedaje con tope**: cada persona cuenta hasta el tope por noche; la hermana elegida en Ajustes pone lo que pase.

## Técnico

Página estática (GitHub Pages) + Supabase (usuarios con correo y contraseña, base de datos con reglas de acceso por viaje).
La lógica de cálculo está en `calculos.js`.
