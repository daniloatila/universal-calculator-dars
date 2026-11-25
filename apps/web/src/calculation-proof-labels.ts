import type { CalculationProof } from './calculation-proof';
import type { Locale } from './i18n';

interface ProofLabels {
  title: string;
  importFile: string;
  exportFile: string;
  dismiss: string;
  computed: string;
  imported: string;
  empty: string;
  unverified: string;
  scope: string;
  invalid: string;
  tooLarge: string;
  exactness: Record<CalculationProof['exactness'], string>;
  fields: Record<keyof CalculationProof, string>;
}

export const proofLabels: Record<Locale, ProofLabels> = {
  en: {
    title: 'Calculation record', importFile: 'Open local JSON', exportFile: 'Download JSON',
    dismiss: 'Close imported record', computed: 'This calculation', imported: 'Imported record',
    empty: 'Run a calculation or open a local record.', unverified: 'Imported values have not been verified.',
    scope: 'An audit record of the computation. Formal proof requires a separate justification.',
    invalid: 'The file does not match calculation record schema 1.', tooLarge: 'The file exceeds 128 KiB.',
    exactness: { exact: 'Exact', symbolic: 'Symbolic', approximate: 'Approximate' },
    fields: {
      schema: 'Schema', module: 'Module', operation: 'Operation', expression: 'Original expression',
      normalized: 'Normalized expression', variables: 'Variables', units: 'Units', options: 'Options',
      domain: 'Domain', method: 'Method', formula: 'Formula', result: 'Result', exactness: 'Exactness',
      precision: 'Precision', tolerance: 'Tolerance', rounding: 'Rounding', error_bound: 'Error bound',
      assumptions: 'Assumptions', constraints: 'Constraints', references: 'References',
      engine_version: 'Engine version', algorithm_version: 'Algorithm version',
    },
  },
  'pt-BR': {
    title: 'Registro de cálculo', importFile: 'Abrir JSON local', exportFile: 'Baixar JSON',
    dismiss: 'Fechar registro importado', computed: 'Este cálculo', imported: 'Registro importado',
    empty: 'Faça um cálculo ou abra um registro local.', unverified: 'Os valores importados não foram verificados.',
    scope: 'Registro para auditoria do cálculo. Uma demonstração formal exige justificativa própria.',
    invalid: 'O arquivo é incompatível com o esquema 1 do registro de cálculo.', tooLarge: 'O arquivo excede 128 KiB.',
    exactness: { exact: 'Exato', symbolic: 'Simbólico', approximate: 'Aproximado' },
    fields: {
      schema: 'Esquema', module: 'Módulo', operation: 'Operação', expression: 'Expressão original',
      normalized: 'Expressão normalizada', variables: 'Variáveis', units: 'Unidades', options: 'Opções',
      domain: 'Domínio', method: 'Método', formula: 'Fórmula', result: 'Resultado', exactness: 'Exatidão',
      precision: 'Precisão', tolerance: 'Tolerância', rounding: 'Arredondamento', error_bound: 'Limite do erro',
      assumptions: 'Premissas', constraints: 'Restrições', references: 'Referências',
      engine_version: 'Versão do motor', algorithm_version: 'Versão do algoritmo',
    },
  },
  'zh-CN': {
    title: '计算记录', importFile: '打开本地 JSON', exportFile: '下载 JSON',
    dismiss: '关闭导入记录', computed: '本次计算', imported: '导入的记录',
    empty: '执行一次计算或打开本地记录。', unverified: '导入的数值未经验证。',
    scope: '用于审计的计算记录。形式证明需要单独论证。',
    invalid: '此文件不符合计算记录架构 1。', tooLarge: '文件超过 128 KiB。',
    exactness: { exact: '精确', symbolic: '符号', approximate: '近似' },
    fields: {
      schema: '架构版本', module: '模块', operation: '运算', expression: '原始表达式',
      normalized: '规范化表达式', variables: '变量', units: '单位', options: '选项',
      domain: '定义域', method: '方法', formula: '公式', result: '结果', exactness: '精确性',
      precision: '精度', tolerance: '容差', rounding: '舍入', error_bound: '误差界',
      assumptions: '假设', constraints: '约束', references: '参考资料',
      engine_version: '引擎版本', algorithm_version: '算法版本',
    },
  },
  hi: {
    title: 'गणना रिकॉर्ड', importFile: 'स्थानीय JSON खोलें', exportFile: 'JSON डाउनलोड करें',
    dismiss: 'आयातित रिकॉर्ड बंद करें', computed: 'यह गणना', imported: 'आयातित रिकॉर्ड',
    empty: 'गणना करें या स्थानीय रिकॉर्ड खोलें।', unverified: 'आयातित मान सत्यापित नहीं हैं।',
    scope: 'गणना की जाँच के लिए रिकॉर्ड। औपचारिक प्रमाण के लिए स्वतंत्र तर्क आवश्यक है।',
    invalid: 'फ़ाइल गणना रिकॉर्ड की स्कीमा 1 से मेल नहीं खाती।', tooLarge: 'फ़ाइल 128 KiB से बड़ी है।',
    exactness: { exact: 'सटीक', symbolic: 'सांकेतिक', approximate: 'अनुमानित' },
    fields: {
      schema: 'स्कीमा', module: 'मॉड्यूल', operation: 'संक्रिया', expression: 'मूल व्यंजक',
      normalized: 'मानकीकृत व्यंजक', variables: 'चर', units: 'इकाइयाँ', options: 'विकल्प',
      domain: 'परिभाषा क्षेत्र', method: 'विधि', formula: 'सूत्र', result: 'परिणाम', exactness: 'सटीकता',
      precision: 'परिशुद्धता', tolerance: 'सहनशीलता', rounding: 'पूर्णांकन', error_bound: 'त्रुटि सीमा',
      assumptions: 'मान्यताएँ', constraints: 'प्रतिबंध', references: 'संदर्भ',
      engine_version: 'इंजन संस्करण', algorithm_version: 'कलनविधि संस्करण',
    },
  },
  es: {
    title: 'Registro de cálculo', importFile: 'Abrir JSON local', exportFile: 'Descargar JSON',
    dismiss: 'Cerrar registro importado', computed: 'Este cálculo', imported: 'Registro importado',
    empty: 'Realiza un cálculo o abre un registro local.', unverified: 'Los valores importados no se han verificado.',
    scope: 'Registro para auditar el cálculo. Una demostración formal requiere una justificación específica.',
    invalid: 'El archivo no cumple el esquema 1 de registro de cálculo.', tooLarge: 'El archivo supera los 128 KiB.',
    exactness: { exact: 'Exacto', symbolic: 'Simbólico', approximate: 'Aproximado' },
    fields: {
      schema: 'Esquema', module: 'Módulo', operation: 'Operación', expression: 'Expresión original',
      normalized: 'Expresión normalizada', variables: 'Variables', units: 'Unidades', options: 'Opciones',
      domain: 'Dominio', method: 'Método', formula: 'Fórmula', result: 'Resultado', exactness: 'Exactitud',
      precision: 'Precisión', tolerance: 'Tolerancia', rounding: 'Redondeo', error_bound: 'Cota de error',
      assumptions: 'Supuestos', constraints: 'Restricciones', references: 'Referencias',
      engine_version: 'Versión del motor', algorithm_version: 'Versión del algoritmo',
    },
  },
  ar: {
    title: 'سجل الحساب', importFile: 'فتح ملف JSON محلي', exportFile: 'تنزيل JSON',
    dismiss: 'إغلاق السجل المستورد', computed: 'هذا الحساب', imported: 'السجل المستورد',
    empty: 'نفّذ عملية حسابية أو افتح سجلاً محلياً.', unverified: 'القيم المستوردة لم تُتحقّق منها الأداة.',
    scope: 'سجل لتدقيق الحساب. يتطلب البرهان الصوري تبريراً مستقلاً.',
    invalid: 'الملف لا يطابق الإصدار 1 من مخطط سجل الحساب.', tooLarge: 'يتجاوز الملف 128 كيلوبايت ثنائي.',
    exactness: { exact: 'دقيق', symbolic: 'رمزي', approximate: 'تقريبي' },
    fields: {
      schema: 'المخطط', module: 'الوحدة', operation: 'العملية', expression: 'التعبير الأصلي',
      normalized: 'التعبير الموحّد', variables: 'المتغيرات', units: 'وحدات القياس', options: 'الخيارات',
      domain: 'المجال', method: 'الطريقة', formula: 'الصيغة', result: 'النتيجة', exactness: 'نوع النتيجة',
      precision: 'مستوى الدقة', tolerance: 'هامش السماح', rounding: 'التقريب', error_bound: 'حد الخطأ',
      assumptions: 'الافتراضات', constraints: 'القيود', references: 'المراجع',
      engine_version: 'إصدار المحرّك', algorithm_version: 'إصدار الخوارزمية',
    },
  },
  fr: {
    title: 'Registre de calcul', importFile: 'Ouvrir un JSON local', exportFile: 'Télécharger le JSON',
    dismiss: 'Fermer le registre importé', computed: 'Ce calcul', imported: 'Registre importé',
    empty: 'Effectuez un calcul ou ouvrez un registre local.', unverified: 'Les valeurs importées sont non vérifiées.',
    scope: 'Registre pour auditer le calcul. Une preuve formelle requiert une justification distincte.',
    invalid: 'Le fichier ne respecte pas le schéma 1 du registre de calcul.', tooLarge: 'Le fichier dépasse 128 Kio.',
    exactness: { exact: 'Exact', symbolic: 'Symbolique', approximate: 'Approximatif' },
    fields: {
      schema: 'Schéma', module: 'Module', operation: 'Opération', expression: 'Expression originale',
      normalized: 'Expression normalisée', variables: 'Variables', units: 'Unités', options: 'Options',
      domain: 'Domaine', method: 'Méthode', formula: 'Formule', result: 'Résultat', exactness: 'Exactitude',
      precision: 'Précision', tolerance: 'Tolérance', rounding: 'Arrondi', error_bound: 'Borne d’erreur',
      assumptions: 'Hypothèses', constraints: 'Contraintes', references: 'Références',
      engine_version: 'Version du moteur', algorithm_version: 'Version de l’algorithme',
    },
  },
};

type Translations = Record<Exclude<Locale, 'en'>, string>;

// Keep the engine's original strings in the file format. Only the viewer localizes them.
const scientificText: Record<string, Translations> = {
  real: { 'pt-BR': 'real', 'zh-CN': '实数域', hi: 'वास्तविक', es: 'real', ar: 'الأعداد الحقيقية', fr: 'réel' },
  complex: { 'pt-BR': 'complexo', 'zh-CN': '复数域', hi: 'समिश्र', es: 'complejo', ar: 'الأعداد المركبة', fr: 'complexe' },
  rad: { 'pt-BR': 'radiano (rad)', 'zh-CN': '弧度 (rad)', hi: 'रेडियन (rad)', es: 'radián (rad)', ar: 'راديان (rad)', fr: 'radian (rad)' },
  deg: { 'pt-BR': 'grau (deg)', 'zh-CN': '度 (deg)', hi: 'डिग्री (deg)', es: 'grado sexagesimal (deg)', ar: 'درجة (deg)', fr: 'degré (deg)' },
  grad: { 'pt-BR': 'grado (grad)', 'zh-CN': '百分度 (grad)', hi: 'ग्रेडियन (grad)', es: 'grado centesimal (grad)', ar: 'غراد (grad)', fr: 'grade (grad)' },
  'exact rational and Gaussian computation with identity rules': {
    'pt-BR': 'Cálculo exato com racionais e racionais gaussianos, usando identidades',
    'zh-CN': '使用恒等式进行精确有理数和高斯有理数计算',
    hi: 'सर्वसमिकाओं के साथ परिमेय और गाउस परिमेय की सटीक गणना',
    es: 'Cálculo exacto con racionales y racionales gaussianos mediante identidades',
    ar: 'حساب دقيق بالأعداد النسبية والنسبية الغاوسية باستخدام المتطابقات',
    fr: 'Calcul exact sur les rationnels et les rationnels gaussiens par identités',
  },
  'symbolic constant or exact multiple': {
    'pt-BR': 'Constante simbólica ou múltiplo exato', 'zh-CN': '符号常数或精确倍数',
    hi: 'सांकेतिक स्थिरांक या उसका सटीक गुणज', es: 'Constante simbólica o múltiplo exacto',
    ar: 'ثابت رمزي أو مضاعف دقيق', fr: 'Constante symbolique ou multiple exact',
  },
  'multiple-precision numerical evaluation': {
    'pt-BR': 'Avaliação numérica em precisão múltipla', 'zh-CN': '多精度数值计算',
    hi: 'बहु-परिशुद्धता संख्यात्मक गणना', es: 'Evaluación numérica con precisión múltiple',
    ar: 'حساب عددي متعدد الدقة', fr: 'Évaluation numérique en précision multiple',
  },
  'nearest, ties to even': {
    'pt-BR': 'Para o mais próximo, com empate para o par', 'zh-CN': '舍入到最近值，正中时取偶数',
    hi: 'निकटतम तक पूर्णांकन, बराबरी पर सम अंक', es: 'Al más cercano, con desempate hacia el par',
    ar: 'التقريب إلى الأقرب، وعند التعادل إلى الزوجي', fr: 'Au plus proche, en cas d’égalité vers le pair',
  },
  'root(x,n)=x^(1/n), with the selected domain': {
    'pt-BR': 'root(x,n)=x^(1/n), no domínio selecionado', 'zh-CN': 'root(x,n)=x^(1/n)，使用所选定义域',
    hi: 'root(x,n)=x^(1/n), चुने हुए परिभाषा क्षेत्र में', es: 'root(x,n)=x^(1/n), en el dominio seleccionado',
    ar: 'root(x,n)=x^(1/n)، ضمن المجال المختار', fr: 'root(x,n)=x^(1/n), dans le domaine sélectionné',
  },
  'Working precision is not a certified error bound.': {
    'pt-BR': 'A precisão de trabalho informa o cálculo. Um limite de erro certificado exige verificação própria.',
    'zh-CN': '工作精度用于计算。误差界需要单独认证。',
    hi: 'कार्यशील परिशुद्धता गणना के लिए है। त्रुटि सीमा के लिए अलग प्रमाणन चाहिए।',
    es: 'La precisión de trabajo se usa en el cálculo. Una cota de error requiere certificación independiente.',
    ar: 'دقة العمل تخص الحساب. يتطلب حد الخطأ تصديقاً مستقلاً.',
    fr: 'La précision de travail sert au calcul. Une borne d’erreur exige une certification distincte.',
  },
  'Complex logarithms and nonintegral powers use principal values.': {
    'pt-BR': 'Logaritmos complexos e potências com expoente não inteiro usam os valores principais.',
    'zh-CN': '复对数和非整数幂使用主值。',
    hi: 'समिश्र लघुगणक और गैर-पूर्णांक घात मुख्य मान लेते हैं।',
    es: 'Los logaritmos complejos y las potencias con exponente no entero usan valores principales.',
    ar: 'تستخدم اللوغاريتمات المركبة والأسس غير الصحيحة القيم الرئيسية.',
    fr: 'Les logarithmes complexes et les puissances à exposant non entier utilisent les valeurs principales.',
  },
  'The requested significant digits agree at two working precisions. No error bound is certified.': {
    'pt-BR': 'Os algarismos significativos solicitados coincidem em duas precisões de trabalho. O limite de erro permanece sem certificação.',
    'zh-CN': '所请求的有效数字在两种工作精度下相同。误差界仍未认证。',
    hi: 'माँगे गए सार्थक अंक दो कार्यशील परिशुद्धताओं पर समान हैं। त्रुटि सीमा अप्रमाणित है।',
    es: 'Las cifras significativas solicitadas coinciden con dos precisiones de trabajo. La cota de error queda sin certificar.',
    ar: 'تتطابق الأرقام المعنوية المطلوبة عند مستويين من دقة العمل. يظل حد الخطأ غير معتمد.',
    fr: 'Les chiffres significatifs demandés concordent à deux précisions de travail. La borne d’erreur reste non certifiée.',
  },
};

const translatableFields = new Set<keyof CalculationProof>([
  'domain', 'method', 'rounding', 'formula', 'assumptions', 'constraints', 'units',
]);

export function localizeProofText(locale: Locale, module: CalculationProof['module'],
  field: keyof CalculationProof, text: string): string {
  if (locale === 'en' || module !== 'scientific' || !translatableFields.has(field) ||
    !Object.hasOwn(scientificText, text)) return text;
  return scientificText[text]?.[locale] ?? text;
}
