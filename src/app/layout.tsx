import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import QueryProvider from './QueryProvider'

dayjs.locale('zh-cn')

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI Token 看板',
  description: '统计和管理用户在 New API 平台的 Token 使用情况',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${inter.className} dark:bg-gray-900`}>
        <QueryProvider>
          <AntdRegistry>
            <ConfigProvider locale={zhCN}>
              <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
                <div className="container mx-auto px-4 py-8">
                  {children}
                </div>
              </main>
            </ConfigProvider>
          </AntdRegistry>
        </QueryProvider>
      </body>
    </html>
  )
}