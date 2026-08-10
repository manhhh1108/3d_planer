import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Tabs, Table, Select, DatePicker, Card, Statistic, Row, Col, Tag, Button, message } from 'antd';
import { FilePdfOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/api/client';
import { exportReportPDF } from '@/utils/pdf-export';

const PROCESS_COLORS: Record<string, string> = {
  Han: 'orange', Son: 'green', 'Lap rap': 'blue', Cat: 'magenta',
  Uon: 'purple', Khoan: 'cyan', Khac: 'default',
};

export default function Reports() {
  const { projectId } = useOutletContext<{ projectId: string }>();
  const [layouts, setLayouts] = useState<any[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [summary, setSummary] = useState<any>(null);
  const [byProcess, setByProcess] = useState<any[]>([]);
  const [occupation, setOccupation] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('summary');

  useEffect(() => {
    api.getLayouts(projectId).then((l) => {
      setLayouts(l);
      if (l.length > 0) setSelectedLayout(l[0].id);
    });
  }, [projectId]);

  useEffect(() => {
    if (!selectedLayout) return;
    const date = selectedDate.format('YYYY-MM-DD');
    if (activeTab === 'summary') {
      api.getReportSummary(selectedLayout, date).then(setSummary).catch(() => setSummary(null));
    } else if (activeTab === 'process') {
      api.getReportByProcess(selectedLayout, date).then(setByProcess).catch(() => setByProcess([]));
    } else if (activeTab === 'occupation') {
      api.getReportOccupation(projectId, selectedLayout).then(setOccupation).catch(() => setOccupation([]));
    }
  }, [selectedLayout, selectedDate, activeTab, projectId]);

  const summaryColumns = [
    { title: 'STT', render: (_: any, __: any, i: number) => i + 1, width: 50 },
    { title: 'San pham', dataIndex: ['product', 'name'] },
    { title: 'Ma', dataIndex: ['product', 'code'], width: 100 },
    { title: 'Vi tri (X, Y)', render: (_: any, r: any) => `${r.x.toFixed(1)}, ${r.y.toFixed(1)}`, width: 120 },
    { title: 'Dien tich (m2)', dataIndex: ['product', 'areaM2'], width: 120 },
    { title: 'Khoi luong (kg)', dataIndex: ['product', 'weightKg'], width: 130 },
    {
      title: 'Cong doan', dataIndex: ['product', 'processStage'], width: 100,
      render: (v: string) => v ? <Tag color={PROCESS_COLORS[v]}>{v}</Tag> : '-',
    },
  ];

  const processColumns = [
    { title: 'Cong doan', dataIndex: 'processStage', render: (v: string) => <Tag color={PROCESS_COLORS[v]}>{v}</Tag> },
    { title: 'So san pham', dataIndex: 'count', width: 120 },
    { title: 'Tong dien tich (m2)', dataIndex: 'totalArea', width: 150, render: (v: number) => v.toFixed(1) },
    { title: 'Tong khoi luong (kg)', dataIndex: 'totalWeight', width: 160, render: (v: number) => v.toFixed(1) },
    { title: 'Ty le dien tich (%)', dataIndex: 'areaPercent', width: 150, render: (v: number) => `${v}%` },
  ];

  const occupationColumns = [
    { title: 'San pham', dataIndex: 'productName' },
    { title: 'Ma', dataIndex: 'productCode', width: 100 },
    { title: 'Layout', dataIndex: 'layoutName', width: 120 },
    { title: 'Tu ngay', dataIndex: 'startDate', width: 100, render: (v: string) => dayjs(v).format('DD/MM') },
    { title: 'Den ngay', dataIndex: 'endDate', width: 100, render: (v: string) => dayjs(v).format('DD/MM') },
    { title: 'So ngay', dataIndex: 'days', width: 80 },
    { title: 'Dien tich (m2)', dataIndex: 'areaM2', width: 120 },
    { title: 'm2 x ngay', dataIndex: 'areaDays', width: 100 },
  ];

  const handleExportPDF = () => {
    if (activeTab === 'summary' && summary) {
      exportReportPDF({
        title: `Tong hop mat bang - ${selectedDate.format('DD/MM/YYYY')}`,
        headers: ['STT', 'San pham', 'Ma', 'Vi tri', 'DT (m2)', 'KL (kg)', 'Cong doan'],
        rows: summary.snapshot.positions.map((p: any, i: number) => [
          i + 1, p.product.name, p.product.code,
          `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`,
          p.product.areaM2 ?? '-', p.product.weightKg ?? '-', p.product.processStage ?? '-',
        ]),
        footer: ['', '', '', 'Tong', summary.totalArea.toFixed(1), '', ''],
      });
    } else if (activeTab === 'process') {
      exportReportPDF({
        title: `Bao cao theo cong doan - ${selectedDate.format('DD/MM/YYYY')}`,
        headers: ['Cong doan', 'So SP', 'Tong DT (m2)', 'Tong KL (kg)', 'Ty le (%)'],
        rows: byProcess.map((p) => [p.processStage, p.count, p.totalArea.toFixed(1), p.totalWeight.toFixed(1), `${p.areaPercent}%`]),
      });
    } else if (activeTab === 'occupation') {
      exportReportPDF({
        title: 'Bao cao thoi gian chiem dung mat bang',
        headers: ['San pham', 'Ma', 'Layout', 'Tu ngay', 'Den ngay', 'So ngay', 'DT (m2)', 'm2*ngay'],
        rows: occupation.map((r) => [
          r.productName, r.productCode, r.layoutName,
          dayjs(r.startDate).format('DD/MM'), dayjs(r.endDate).format('DD/MM'),
          r.days, r.areaM2, r.areaDays,
        ]),
        footer: ['', '', '', '', '', '', 'Tong', occupation.reduce((s: number, r: any) => s + r.areaDays, 0).toFixed(1)],
      });
    }
    message.success('Da xuat PDF');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <Select
          style={{ width: 200 }}
          placeholder="Chon mat bang"
          value={selectedLayout}
          onChange={setSelectedLayout}
          options={layouts.map((l: any) => ({ label: l.name, value: l.id }))}
        />
        <DatePicker value={selectedDate} onChange={(d) => d && setSelectedDate(d)} />
        <Button icon={<FilePdfOutlined />} onClick={handleExportPDF}>
          Xuat PDF
        </Button>
      </div>

      {summary && activeTab === 'summary' && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Card><Statistic title="San pham" value={summary.snapshot.positions.length} /></Card></Col>
          <Col span={6}><Card><Statistic title="Tong DT chiem (m2)" value={summary.totalArea} precision={1} /></Card></Col>
          <Col span={6}><Card><Statistic title="DT mat bang (m2)" value={summary.layoutArea} precision={1} /></Card></Col>
          <Col span={6}><Card><Statistic title="Ty le su dung (%)" value={summary.usageRate} precision={1} suffix="%" /></Card></Col>
        </Row>
      )}

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: 'summary', label: 'Tong hop mat bang',
          children: <Table dataSource={summary?.snapshot?.positions ?? []} columns={summaryColumns} rowKey="id" size="small" />,
        },
        {
          key: 'process', label: 'Theo cong doan',
          children: <Table dataSource={byProcess} columns={processColumns} rowKey="processStage" size="small" />,
        },
        {
          key: 'occupation', label: 'Thoi gian chiem dung',
          children: <Table dataSource={occupation} columns={occupationColumns} rowKey={(r) => `${r.productCode}-${r.startDate}`} size="small"
            summary={() => {
              const total = occupation.reduce((s, r) => s + r.areaDays, 0);
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={7}>Tong m2 x ngay</Table.Summary.Cell>
                  <Table.Summary.Cell index={1}>{total.toFixed(1)}</Table.Summary.Cell>
                </Table.Summary.Row>
              );
            }}
          />,
        },
      ]} />
    </div>
  );
}
