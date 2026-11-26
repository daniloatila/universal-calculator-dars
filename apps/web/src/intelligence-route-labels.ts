import type {Locale} from './i18n';
const labels={
  'en':'Loopback address|Review model discovery|Include the configured credential in discovery|Available models|Connected. No eligible models advertised.|No service accepted the connection at this address and port.|The service timed out.|Access denied by the operating system.|Authentication denied by the service.|Selected model is absent.|Response differs from the selected API.|Service unreachable.|Credential required.',
  'pt-BR':'Endereço de loopback|Revisar consulta de modelos|Incluir a credencial configurada na consulta|Modelos disponíveis|Conectado. O serviço não anunciou modelos elegíveis.|Nenhum serviço aceitou a conexão neste endereço e porta.|O serviço excedeu o tempo limite.|Acesso negado pelo sistema operacional.|O serviço recusou a autenticação.|O modelo escolhido está ausente.|A resposta não corresponde à API selecionada.|Serviço inacessível.|Credencial necessária.',
  'es':'Dirección de loopback|Revisar consulta de modelos|Incluir la credencial configurada en la consulta|Modelos disponibles|Conectado. Ningún modelo disponible.|Ningún servicio aceptó la conexión en este puerto y dirección.|Tiempo de espera agotado.|El sistema ha denegado el acceso.|Autenticación denegada.|Falta el modelo elegido.|Respuesta incompatible con la API elegida.|Servicio inaccesible.|Credencial necesaria.',
  'fr':'Adresse de bouclage|Vérifier la recherche de modèles|Inclure le justificatif configuré dans la recherche|Modèles disponibles|Connecté. Aucun modèle admissible.|Aucun service à cette adresse et à ce port.|Délai expiré.|Accès refusé par le système.|Authentification refusée.|Modèle absent.|Réponse incompatible avec cette API.|Service inaccessible.|Identifiant requis.',
  'ar':'عنوان الاسترجاع|مراجعة استعلام النماذج|تضمين بيانات الاعتماد في الاستعلام|النماذج المتاحة|تم الاتصال. لا توجد نماذج مؤهلة.|لا توجد خدمة تقبل الاتصال على العنوان والمنفذ المحددين.|انتهت مهلة الخدمة.|رفض نظام التشغيل الوصول.|رفضت الخدمة المصادقة.|النموذج المطلوب غير موجود.|لم تطابق الاستجابة الواجهة المحددة.|الخدمة غير متاحة.|بيانات الاعتماد مطلوبة.',
  'zh-CN':'回环地址|核对模型查询|查询时使用已配置的凭据|可用模型|已连接，未找到合适的模型。|此地址和端口没有服务接受连接。|服务超时。|操作系统拒绝访问。|服务拒绝身份验证。|未找到所选模型。|响应与选定的 API 不匹配。|无法连接服务。|需要凭据。',
  'hi':'लूपबैक पता|मॉडल खोज की समीक्षा करें|खोज में कॉन्फ़िगर किया क्रेडेंशियल शामिल करें|उपलब्ध मॉडल|कनेक्ट हुआ। कोई उपयुक्त मॉडल नहीं मिला।|इस पते और पोर्ट पर किसी सेवा ने कनेक्शन स्वीकार नहीं किया।|सेवा का समय समाप्त हो गया।|सिस्टम ने पहुँच अस्वीकार की।|प्रमाणीकरण अस्वीकार।|चयनित मॉडल नहीं मिला।|उत्तर चयनित API से मेल नहीं खाता।|सेवा उपलब्ध नहीं है।|क्रेडेंशियल आवश्यक है।'
} satisfies Record<Locale,string>;
const ids=['address','inventory','auth','available','empty','connection_refused','timeout','access_denied','credential_denied','model_unavailable','invalid_response','network_error','missing_credential'] as const;
export function routeLabels(locale:Locale){
  const parts=labels[locale].split('|');
  if(parts.length!==ids.length)throw new Error('Missing route translation');
  return Object.fromEntries(ids.map((id,i)=>[id,parts[i]])) as Record<typeof ids[number],string>;
}
