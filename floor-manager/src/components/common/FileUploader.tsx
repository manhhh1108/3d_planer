import { Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';

interface FileUploaderProps {
  accept: string;
  onUploaded: (url: string) => void;
  label?: string;
}

export default function FileUploader({ accept, onUploaded, label }: FileUploaderProps) {
  const props: UploadProps = {
    name: 'file',
    action: '/api/files/upload',
    accept,
    showUploadList: false,
    onChange(info) {
      if (info.file.status === 'done') {
        const url = info.file.response.path;
        onUploaded(url);
        message.success(`${info.file.name} uploaded`);
      } else if (info.file.status === 'error') {
        message.error('Upload that bai');
      }
    },
  };

  return (
    <Upload {...props}>
      <Button icon={<UploadOutlined />}>{label ?? 'Upload'}</Button>
    </Upload>
  );
}
