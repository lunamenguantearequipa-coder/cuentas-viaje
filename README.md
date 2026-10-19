# Cuentas Hermanizzz

App para registrar los gastos del viaje familiar y saber quién le debe a quién.

- **Resumen**: tu saldo, cómo quedar a mano y en qué se fue la plata.
- **Registrar**: gastos (con 6 formas de dividir) y pagos entre hermanas.
- **Movimientos**: buscar, filtrar, editar y borrar.
- **Personas**: saldo de cada una y porcentajes de quién cubre a papá y mamá.
- **Ajustes**: tope de hospedaje por noche, tipo de cambio y código para invitar.

## Cómo funciona el reparto

- Cada hermana paga su parte.
- La parte de las personas "cubiertas" (papá y mamá) se reparte según sus porcentajes (50% Andrea, 25% Camila, 25% Adriana).
- **Hospedaje con tope**: cada persona cuenta hasta el tope por noche; la hermana elegida en Ajustes pone lo que pase.

## Técnico

Página estática (GitHub Pages) + Supabase (usuarios con correo y contraseña, base de datos con reglas de acceso por viaje).
La lógica de cálculo está en `calculos.js`.
