import { brand } from '@pe/shared';
import { Link, Text } from '@react-email/components';

import { Layout } from './Layout';

export interface DataExportReadyData {
  readonly downloadUrl: string;
  readonly expiresMinutes: number;
}

const styles = {
  heading: {
    color: '#1a1a1a',
    fontSize: '20px',
    fontWeight: '600',
    margin: '0 0 16px 0',
  },
  body: {
    color: '#444444',
    fontSize: '15px',
    lineHeight: '1.6',
    margin: '0 0 16px 0',
  },
  note: {
    color: '#888888',
    fontSize: '13px',
    margin: '0',
  },
} as const;

export const DataExportReady = ({
  downloadUrl,
  expiresMinutes,
}: DataExportReadyData): React.ReactElement => (
  <Layout preview={`Your ${brand.name} data export is ready`}>
    <Text style={styles.heading}>Your data export is ready</Text>
    <Text style={styles.body}>
      Your {brand.name} account data export has been prepared. You can download it using the link
      below.
    </Text>
    <Text style={styles.body}>
      <Link href={downloadUrl}>Download your data export</Link>
    </Text>
    <Text style={styles.note}>
      This link expires in {expiresMinutes} minutes. After that, you will need to request a new
      export.
    </Text>
  </Layout>
);

export default DataExportReady;
