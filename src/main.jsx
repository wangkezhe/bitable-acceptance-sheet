import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertCircle,
  Database,
  FileText,
  LoaderCircle,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Trash2
} from 'lucide-react';
import './styles.css';

const DEMO_RECORD = {
  projectName: '浙江高速石油发展有限公司2026年档案整理及数字化服务项目',
  servicePeriod: '2026年5月20日至2026年6月30日',
  items: [
    { content: '2025年文书档案整理', unit: '件', quantity: 1471, unitPrice: 0.52, amount: 764.92 },
    { content: '2025年业务档案整理', unit: '卷', quantity: 35, unitPrice: 12, amount: 420 },
    { content: '2025年文书和业务档案条目著录', unit: '条', quantity: 1562, unitPrice: 0.35, amount: 546.7 },
    { content: '2025年文书档案和业务档案数字化', unit: '页', quantity: 26679, unitPrice: 0.16, amount: 4268.64 },
    { content: '2025年文书档案打印', unit: '页', quantity: 26079, unitPrice: 0.08, amount: 2086.32 },
    { content: '档案盒', unit: '只', quantity: 61, unitPrice: 8, amount: 488 }
  ]
};

const EMPTY_ITEM = { content: '新增服务内容', unit: '项', quantity: 1, unitPrice: 0, amountOverride: null };

function toNumber(value) {
  const result = Number(String(value ?? '').replace(/[\s,，￥¥]/g, ''));
  return Number.isFinite(result) ? result : 0;
}

function formatMoney(value) {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function getItemAmount(item) {
  return item.amountOverride ?? (toNumber(item.quantity) * toNumber(item.unitPrice));
}

function formatServiceDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const serial = Number(text);
  if (Number.isFinite(serial) && serial >= 20000 && serial <= 60000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
  }

  return text;
}

function splitDelimited(raw) {
  return String(raw ?? '')
    .split(/[,，;；\n\r]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitUnitPrices(raw) {
  const source = String(raw ?? '');
  const currencyValues = source.match(/[￥¥]\s*[\d,]+(?:\.\d+)?/g);
  return currencyValues?.map((value) => value.trim()).filter(Boolean) ?? splitDelimited(source);
}

function parseServiceItems({ contents, units, quantities, unitPrices }) {
  const contentValues = splitDelimited(contents);
  const unitValues = splitDelimited(units);
  const quantityValues = splitDelimited(quantities);
  const priceValues = splitUnitPrices(unitPrices);
  const length = contentValues.length || Math.max(unitValues.length, quantityValues.length, priceValues.length);

  return Array.from({ length }, (_, index) => {
    const quantity = toNumber(quantityValues[index]);
    const unitPrice = toNumber(priceValues[index]);
    return {
      content: contentValues[index] || '未命名服务',
      unit: unitValues[index] || '项',
      quantity,
      unitPrice,
      amountOverride: null
    };
  });
}

function normalizeFieldName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[\s_\-()（）【】\[\]{}:：]/g, '');
}

function findFieldId(fieldMetaList, candidates) {
  const normalizedCandidates = candidates.map(normalizeFieldName);
  const exact = fieldMetaList.find((field) => normalizedCandidates.includes(normalizeFieldName(field.name)));
  if (exact) return exact.id;

  const partial = fieldMetaList.find((field) => {
    const name = normalizeFieldName(field.name);
    return normalizedCandidates.some((candidate) => candidate.length > 2 && (name.includes(candidate) || candidate.includes(name)));
  });
  return partial?.id ?? '';
}

const FIELD_ALIASES = {
  project: ['项目名称', '项目名', '项目', '结算项目', '服务项目名称'],
  period: ['服务起止时间', '服务周期', '服务期间', '服务日期', '服务时间'],
  startDate: ['服务起始时间', '服务开始时间', '开始时间', '起始日期', '开始日期'],
  endDate: ['服务截止时间', '服务结束时间', '结束时间', '截止日期', '结束日期'],
  content: ['服务内容', '服务项目明细', '服务明细', '结算内容', '结算项目', '项目内容'],
  unit: ['单位', '服务单位', '计量单位'],
  quantity: ['数量', '服务数量', '结算数量', '工作量'],
  unitPrice: ['销售单价', '服务单价', '单价', '销售价']
};

async function loadSdkContext() {
  const sdk = await import('@lark-base-open/js-sdk');
  const { workspace, dashboard, bitable } = sdk;
  const directBitable = bitable?.base?.getTableMetaList ? bitable : null;

  const config = await dashboard?.getConfig?.().catch(() => null);
  if (workspace?.getBaseList && workspace?.getBitable) {
    try {
      const baseResult = await workspace.getBaseList({});
      return {
        Workspace: workspace,
        initialBaseToken: config?.dataConditions?.[0]?.baseToken ?? '',
        initialTableId: config?.dataConditions?.[0]?.tableId ?? '',
        initialRecordId: config?.customConfig?.recordId ?? '',
        initialFieldMap: config?.customConfig?.fieldMap ?? {},
        bases: baseResult?.base_list ?? []
      };
    } catch (error) {
      if (!directBitable) throw error;
    }
  }

  if (!directBitable) {
    throw new Error('当前插件容器未提供飞书多维表格 SDK。');
  }

  // Sidebar plugins access the current Base directly instead of using Workspace.
  await directBitable.base.getTableMetaList();
  return {
    Workspace: { getBitable: async () => directBitable },
    initialBaseToken: '__current_base__',
    initialTableId: '',
    initialRecordId: '',
    initialFieldMap: {},
    bases: [{ token: '__current_base__', name: '当前多维表格' }]
  };
}

function App() {
  const [record, setRecord] = useState(DEMO_RECORD);
  const [projectName, setProjectName] = useState(DEMO_RECORD.projectName);
  const [items, setItems] = useState(DEMO_RECORD.items);
  const [status, setStatus] = useState({ kind: 'demo', message: '演示数据已加载。进入飞书应用插件后可选择多维表格记录。' });
  const [sdkContext, setSdkContext] = useState(null);
  const [baseToken, setBaseToken] = useState('');
  const [bitable, setBitable] = useState(null);
  const [tables, setTables] = useState([]);
  const [tableId, setTableId] = useState('');
  const [records, setRecords] = useState([]);
  const [recordId, setRecordId] = useState('');
  const [fieldMetaList, setFieldMetaList] = useState([]);
  const [fieldMap, setFieldMap] = useState({
    project: '', period: '', startDate: '', endDate: '', content: '', unit: '', quantity: '', unitPrice: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + getItemAmount(item), 0),
    [items]
  );

  useEffect(() => {
    let cancelled = false;
    loadSdkContext()
      .then((context) => {
        if (cancelled) return;
        setSdkContext(context);
        const defaultToken = context.initialBaseToken || context.bases[0]?.token || '';
        setBaseToken(defaultToken);
        setFieldMap((current) => ({ ...current, ...context.initialFieldMap }));
        setStatus({ kind: 'connected', message: '已连接飞书应用插件环境。请选择数据表与记录。' });
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ kind: 'demo', message: '未检测到飞书容器，正在使用演示记录核对单据版式。' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sdkContext || !baseToken) return;
    let cancelled = false;
    setIsLoading(true);
    sdkContext.Workspace.getBitable(baseToken)
      .then(async (nextBitable) => {
        if (!nextBitable) throw new Error('无法访问所选多维表格，请确认应用已被授权。');
        const nextTables = await nextBitable.base.getTableMetaList();
        if (cancelled) return;
        setBitable(nextBitable);
        setTables(nextTables);
        const savedTableExists = nextTables.some((table) => table.id === sdkContext.initialTableId);
        setTableId(savedTableExists ? sdkContext.initialTableId : (nextTables[0]?.id ?? ''));
        setStatus({ kind: 'connected', message: '数据源已连接，正在读取数据表。' });
      })
      .catch((error) => {
        if (!cancelled) setStatus({ kind: 'error', message: error.message });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sdkContext, baseToken]);

  useEffect(() => {
    if (!bitable || !tableId) return;
    let cancelled = false;
    setIsLoading(true);
    bitable.base.getTableById(tableId)
      .then(async (table) => {
        const [nextFields, nextRecordIds] = await Promise.all([
          table.getFieldMetaList(),
          table.getRecordIdList()
        ]);
        if (cancelled) return;
        setFieldMetaList(nextFields);
        setRecords(nextRecordIds.map((id) => ({ id, label: id })));
        const savedRecordExists = nextRecordIds.includes(sdkContext.initialRecordId);
        setRecordId(savedRecordExists ? sdkContext.initialRecordId : (nextRecordIds[0] ?? ''));
        setFieldMap((current) => ({
          project: current.project || findFieldId(nextFields, FIELD_ALIASES.project),
          period: current.period || findFieldId(nextFields, FIELD_ALIASES.period),
          startDate: current.startDate || findFieldId(nextFields, FIELD_ALIASES.startDate),
          endDate: current.endDate || findFieldId(nextFields, FIELD_ALIASES.endDate),
          content: current.content || findFieldId(nextFields, FIELD_ALIASES.content),
          unit: current.unit || findFieldId(nextFields, FIELD_ALIASES.unit),
          quantity: current.quantity || findFieldId(nextFields, FIELD_ALIASES.quantity),
          unitPrice: current.unitPrice || findFieldId(nextFields, FIELD_ALIASES.unitPrice)
        }));
      })
      .catch((error) => {
        if (!cancelled) setStatus({ kind: 'error', message: `读取数据表失败：${error.message}` });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bitable, tableId]);

  async function loadSelectedRecord() {
    if (!bitable || !tableId || !recordId) return;
    setIsLoading(true);
    try {
      const table = await bitable.base.getTableById(tableId);
      const read = async (fieldId) => (fieldId ? table.getCellString(fieldId, recordId) : '');
      const [projectName, period, startDate, endDate, contents, units, quantities, unitPrices] = await Promise.all([
        read(fieldMap.project),
        read(fieldMap.period),
        read(fieldMap.startDate),
        read(fieldMap.endDate),
        read(fieldMap.content),
        read(fieldMap.unit),
        read(fieldMap.quantity),
        read(fieldMap.unitPrice)
      ]);
      const servicePeriod = period || [formatServiceDate(startDate), formatServiceDate(endDate)].filter(Boolean).join('至');
      const nextItems = parseServiceItems({ contents, units, quantities, unitPrices });
      const contentCount = splitDelimited(contents).length;
      const priceCount = splitUnitPrices(unitPrices).length;
      const priceNotice = contentCount && contentCount !== priceCount
        ? ` 服务内容 ${contentCount} 项，销售单价 ${priceCount} 项；未对齐价格请在右侧调整。`
        : '';
      setRecord({
        projectName: projectName || '未填写项目名称',
        servicePeriod: servicePeriod || '未填写服务起止时间',
        items: nextItems.length ? nextItems : [EMPTY_ITEM]
      });
      setProjectName(projectName || '未填写项目名称');
      setItems(nextItems.length ? nextItems : [EMPTY_ITEM]);
      setStatus({ kind: 'connected', message: `已按所选记录更新验收单。数量和单价可在右侧继续调整。${priceNotice}` });
    } catch (error) {
      setStatus({ kind: 'error', message: `读取记录失败：${error.message}` });
    } finally {
      setIsLoading(false);
    }
  }

  async function savePluginConfig() {
    if (!bitable || !baseToken || !tableId) {
      setStatus({ kind: 'error', message: '请先完成数据源选择，再保存应用配置。' });
      return;
    }
    try {
      await bitable.dashboard.saveConfig({
        dataConditions: [{ baseToken, tableId }],
        customConfig: { fieldMap, recordId }
      });
      setStatus({ kind: 'connected', message: '应用配置已保存。' });
    } catch (error) {
      setStatus({ kind: 'error', message: `保存应用配置失败：${error.message}` });
    }
  }

  function updateItem(index, key, value) {
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index
        ? (() => {
          const next = { ...item };
          if (key === 'amount') next.amountOverride = toNumber(value);
          else next[key] = key === 'quantity' || key === 'unitPrice' ? toNumber(value) : value;
          if (key === 'quantity' || key === 'unitPrice') next.amountOverride = null;
          return next;
        })()
        : item
    )));
  }

  function resetPricing() {
    setItems(record.items.map((item) => ({ ...item })));
    setProjectName(record.projectName);
    setStatus({ kind: 'demo', message: '项目名称、数量和单价已恢复为所选记录的初始值。' });
  }

  const fieldOptions = fieldMetaList.map((field) => ({ value: field.id, label: field.name }));
  const rowHeight = Math.max(4.3, Math.min(11.4, 66 / Math.max(items.length, 1)));
  const printScale = Math.max(0.58, Math.min(1, 8 / Math.max(items.length, 1)));

  return (
    <main className="app-shell">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Bitable application plugin</p>
          <h1>档案服务验收单</h1>
        </div>
        <div className={`connection-state ${status.kind}`}>
          {isLoading ? <LoaderCircle size={15} className="spin" /> : <Database size={15} />}
          <span>{status.message}</span>
        </div>
      </header>

      <section className="workspace-grid">
        <article className="paper-stage" aria-label="验收单预览">
          <div className="paper-sheet" style={{ '--service-row-height': `${rowHeight}mm`, '--print-scale': printScale }}>
            <table className="acceptance-sheet">
              <colgroup>
                <col /><col /><col /><col /><col /><col />
              </colgroup>
              <tbody>
                <tr><td colSpan="6" className="sheet-title">档案服务验收单</td></tr>
                <tr><td colSpan="6" className="acceptance-type">样本验收（　）　　阶段性验收（　）　　终验（　）</td></tr>
                <tr><th colSpan="2">项目名称</th><td colSpan="4" className="strong-cell">{projectName}</td></tr>
                <tr><th colSpan="2">服务起止时间</th><td colSpan="4" className="strong-cell">{record.servicePeriod}</td></tr>
                <tr className="service-heading">
                  <th rowSpan={items.length + 2} colSpan="2">服务内容</th>
                  <th>序号</th><th>服务内容</th><th>单位</th><th>数量</th>
                </tr>
                {items.map((item, index) => (
                  <tr key={`${item.content}-${index}`} className="service-row">
                    <td>{index + 1}</td>
                    <td className="service-content">{item.content}</td>
                    <td>{item.unit}</td>
                    <td>{item.quantity}</td>
                  </tr>
                ))}
                <tr><td colSpan="4" className="total-cell">服务费用合计 <b>{formatMoney(total)}</b> 元。</td></tr>
                <tr className="signature-large"><th colSpan="2">客　　户<br />验收意见</th><td colSpan="4" className="signature-content">验收结论：合格□　　　不合格□<br /><br />签字或盖章：<br /><br />验收日期：<span className="acceptance-date-blank" /></td></tr>
                <tr className="signature-medium"><th colSpan="2">项目负责人<br />意见</th><td colSpan="4" className="signature-content compact">签字或盖章：　　　　　　　　　　　　　　　　　日期：</td></tr>
                <tr className="remark-row"><th colSpan="2">备　　注</th><td colSpan="4"></td></tr>
                <tr><td colSpan="6" className="sheet-note">注：本验收单一式两份，甲方和乙方各执一份。</td></tr>
              </tbody>
            </table>
          </div>
        </article>

        <aside className="control-panel" aria-label="验收单编辑器">
          <section className="panel-section">
            <div className="panel-heading"><Database size={18} /><h2>数据源</h2></div>
            {sdkContext ? (
              <>
                <label>多维表格
                  <select value={baseToken} onChange={(event) => setBaseToken(event.target.value)}>
                    {sdkContext.bases.map((base) => <option key={base.token} value={base.token}>{base.name}</option>)}
                  </select>
                </label>
                <label>数据表
                  <select value={tableId} onChange={(event) => setTableId(event.target.value)}>
                    {tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
                  </select>
                </label>
                <label>记录
                  <select value={recordId} onChange={(event) => setRecordId(event.target.value)}>
                    {records.map((sourceRecord) => <option key={sourceRecord.id} value={sourceRecord.id}>{sourceRecord.label}</option>)}
                  </select>
                </label>
              </>
            ) : <p className="panel-hint">本地预览模式不连接多维表格。部署后在应用插件容器中选择数据源。</p>}
          </section>

          <section className="panel-section">
            <div className="panel-heading"><FileText size={18} /><h2>字段映射</h2></div>
            {['project', 'period', 'startDate', 'endDate', 'content', 'unit', 'quantity', 'unitPrice'].map((key) => (
              <label key={key}>{({ project: '项目名称', period: '服务起止时间', startDate: '服务起始时间', endDate: '服务截止时间', content: '服务内容', unit: '单位', quantity: '数量', unitPrice: '销售单价' })[key]}
                <select value={fieldMap[key]} onChange={(event) => setFieldMap((current) => ({ ...current, [key]: event.target.value }))}>
                  <option value="">未映射</option>
                  {fieldOptions.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
                </select>
              </label>
            ))}
            <button className="secondary-action" onClick={loadSelectedRecord} disabled={!bitable || !recordId || isLoading}>
              <RefreshCw size={16} />读取所选记录
            </button>
            <button className="ghost-action" onClick={savePluginConfig} disabled={!bitable}><Save size={16} />保存应用配置</button>
          </section>

          <section className="panel-section editable-section">
            <div className="panel-heading"><FileText size={18} /><h2>数量与单价</h2></div>
            <p className="panel-hint">打印单不显示单价。数量或单价修改后自动重算金额；金额也可单独调整，合计取调整后的金额。</p>
            <label className="project-name-editor">项目名称
              <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            </label>
            <div className="pricing-list">
              {items.map((item, index) => (
                <div className="pricing-row" key={`${item.content}-editor-${index}`}>
                  <label className="pricing-name">服务内容
                    <input value={item.content} onChange={(event) => updateItem(index, 'content', event.target.value)} />
                  </label>
                  <label>数量<input type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} /></label>
                  <label>单价<input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(index, 'unitPrice', event.target.value)} /></label>
                  <label>金额<input type="number" min="0" step="0.01" value={getItemAmount(item)} onChange={(event) => updateItem(index, 'amount', event.target.value)} /></label>
                  <button className="icon-action" title="删除服务项" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <button className="ghost-action" onClick={() => setItems((current) => [...current, { ...EMPTY_ITEM }])}><Plus size={16} />新增服务项</button>
            <button className="ghost-action" onClick={resetPricing}><RefreshCw size={16} />恢复记录初值</button>
          </section>

          <section className="panel-section panel-actions">
            <div className="total-summary"><span>当前费用合计</span><strong>{formatMoney(total)} 元</strong></div>
            <button className="print-action" onClick={() => window.print()}><Printer size={17} />打印验收单</button>
          </section>
        </aside>
      </section>

      {status.kind === 'error' && <div className="error-banner"><AlertCircle size={18} />{status.message}</div>}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
