/**
 * Demo data for a fictitious bank branch ("Banco Demo"). The domain model
 * is generic: an administrator can create, edit or deactivate any of these
 * service types from the admin panel.
 */
export interface SeedServiceType {
  prefix: string;
  name: string;
  description: string;
  avgServiceTimeMinutes: number;
  steps: string[];
}

export const SEED_INSTITUTION = {
  code: 'banco-demo-centro',
  name: 'Banco Demo · Sucursal Centro',
  timezone: 'America/Bogota',
};

export const SEED_SERVICE_TYPES: SeedServiceType[] = [
  {
    prefix: 'C',
    name: 'Consulta rápida',
    description: 'Saldo, información y certificados simples',
    avgServiceTimeMinutes: 3,
    steps: [
      'Verificar identidad',
      'Consultar en el sistema',
      'Entregar información o certificado',
    ],
  },
  {
    prefix: 'D',
    name: 'Depósito o retiro',
    description: 'Consignaciones y retiros en ventanilla',
    avgServiceTimeMinutes: 5,
    steps: [
      'Verificar identidad',
      'Validar cuenta y monto',
      'Contar efectivo',
      'Registrar transacción',
      'Entregar comprobante',
    ],
  },
  {
    prefix: 'P',
    name: 'Pago de servicios e impuestos',
    description: 'Servicios públicos, impuestos y obligaciones',
    avgServiceTimeMinutes: 6,
    steps: [
      'Recibir factura o referencia',
      'Validar convenio',
      'Recibir pago',
      'Entregar comprobante',
    ],
  },
  {
    prefix: 'T',
    name: 'Tarjetas',
    description: 'Bloqueo, reposición y activación de tarjetas',
    avgServiceTimeMinutes: 10,
    steps: [
      'Verificar identidad',
      'Bloquear tarjeta anterior',
      'Solicitar reposición',
      'Asignar clave temporal',
      'Confirmar con el cliente',
    ],
  },
  {
    prefix: 'R',
    name: 'Reclamos y PQR',
    description: 'Peticiones, quejas, reclamos y sugerencias',
    avgServiceTimeMinutes: 15,
    steps: [
      'Escuchar el caso',
      'Revisar movimientos',
      'Radicar la solicitud',
      'Explicar tiempos de respuesta',
    ],
  },
  {
    prefix: 'A',
    name: 'Apertura de cuenta',
    description: 'Cuentas de ahorro y corriente',
    avgServiceTimeMinutes: 25,
    steps: [
      'Verificar identidad',
      'Diligenciar formulario',
      'Validar listas de control',
      'Firmar contrato',
      'Crear cuenta en el sistema',
      'Entregar tarjeta débito',
    ],
  },
  {
    prefix: 'K',
    name: 'Solicitud de crédito',
    description: 'Créditos de consumo, libranza y vivienda',
    avgServiceTimeMinutes: 35,
    steps: [
      'Entrevista inicial',
      'Revisar documentos',
      'Consultar centrales de riesgo',
      'Simular crédito',
      'Radicar solicitud',
      'Explicar siguientes pasos',
    ],
  },
];
