// Mock data para testing local
export const mockMeetings = [
  {
    id: 'b64c1ac2-420f-49e9-986d-224dd3d8804e',
    title: 'Connect proposal Damos.com.ar',
    date: '2026-02-11T13:06:00Z',
    attendees: ['Santiago'],
    summary: `### Propuesta Connect para Damos.com.ar

- Diagrama actual funciona para venta pero necesita explicación detallada del flujo
- Requiere documentación paso a paso del proceso completo
- Pricing ya disponible para incluir en propuesta

### Arquitectura y Servicios AWS

- API Gateway con DynamoDB como componentes principales
- Dos escenarios de implementación:
  1. Cliente con CRM existente - integración más económica
  2. Desarrollo de API desde cero - solución completa`,
    tags: ['connect', 'proposal', 'damos', 'aws', 'architecture']
  },
  {
    id: 'mock-2',
    title: 'Sprint Planning Q1 2026',
    date: '2026-03-01T10:00:00Z',
    attendees: ['Santiago', 'Maria', 'John'],
    summary: `### Sprint Goals
- Complete callback implementation
- Review architecture diagrams
- Update documentation

### Action Items
- Santiago: Finish API integration
- Maria: Review security compliance
- John: Update test coverage`,
    tags: ['sprint', 'planning', 'team']
  },
  {
    id: 'mock-3',
    title: 'Client Discovery Call - TechCorp',
    date: '2026-02-28T15:30:00Z',
    attendees: ['Santiago', 'Client Team'],
    summary: `### Requirements Discussion
- Need real-time analytics dashboard
- Integration with existing CRM
- Mobile app support required

### Technical Constraints
- Must support 10k concurrent users
- Data residency in US region
- GDPR compliance needed`,
    tags: ['discovery', 'client', 'requirements']
  }
]
