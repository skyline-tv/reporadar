'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Container,
  Heading,
  Text,
  VStack,
  HStack,
  Button,
  Spinner,
  Alert,
  AlertIcon,
  IconButton,
  useToast,
  Flex,
  Select,
  Tooltip,
} from '@chakra-ui/react';
import { DeleteIcon, RepeatIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import { FiClock } from 'react-icons/fi';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiUrl } from '@/lib/api';
import AppNav from '../components/AppNav';
import StatusBadge from '../components/StatusBadge';

interface HistoryItem {
  id: string;
  repoUrl: string;
  owner: string;
  repo: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  projectType?: string | null;
  createdAt: string;
}

interface HistoryResponse {
  items: HistoryItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function HistoryPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadHistory = useCallback(
    async (pageNum: number, status: string) => {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(pageNum), limit: '10' });
        if (status) params.set('status', status);
        const response = await fetch(apiUrl(`/analysis/history?${params}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
          return;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Failed to load history');
        setData(payload.data);
        setPage(pageNum);
      } catch (err: any) {
        setError(err.message || 'Failed to load history');
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    loadHistory(1, statusFilter);
  }, [loadHistory, statusFilter]);

  const handleDelete = async (id: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setDeletingId(id);
    try {
      const response = await fetch(apiUrl(`/analysis/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Delete failed');
      toast({ title: 'Deleted', status: 'success', duration: 2000, isClosable: true });
      await loadHistory(page, statusFilter);
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, status: 'error', duration: 3500, isClosable: true });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Box minH="100vh" bg="surface.500">
      <AppNav />
      <Container maxW="container.lg" py={{ base: 6, md: 10 }}>
        <VStack align="stretch" spacing={6}>
          <Flex justify="space-between" align={{ base: 'stretch', sm: 'center' }} gap={3} direction={{ base: 'column', sm: 'row' }}>
            <Box>
              <Heading size="lg" letterSpacing="-0.03em" mb={1}>
                Analysis history
              </Heading>
              <Text color="gray.400" fontSize="sm">
                Reopen reports, filter by status, or remove old runs.
              </Text>
            </Box>
            <HStack>
              <Select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                maxW="170px"
                size="sm"
                bg="surface.200"
              >
                <option value="">All statuses</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="processing">Processing</option>
                <option value="pending">Pending</option>
              </Select>
              <IconButton
                aria-label="Refresh history"
                icon={<RepeatIcon />}
                size="sm"
                variant="outline"
                onClick={() => loadHistory(page, statusFilter)}
              />
            </HStack>
          </Flex>

          {loading && (
            <Flex justify="center" py={16}>
              <VStack spacing={3}>
                <Spinner color="brand.400" />
                <Text color="gray.400">Loading history…</Text>
              </VStack>
            </Flex>
          )}

          {!loading && error && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              <VStack align="start" spacing={2}>
                <Text>{error}</Text>
                <Button size="sm" onClick={() => loadHistory(page, statusFilter)}>
                  Retry
                </Button>
              </VStack>
            </Alert>
          )}

          {!loading && !error && data?.items.length === 0 && (
            <Box
              textAlign="center"
              py={16}
              px={6}
              borderWidth="1px"
              borderColor="whiteAlpha.200"
              borderRadius="lg"
              bg="surface.200"
            >
              <FiClock size={32} style={{ margin: '0 auto 12px', opacity: 0.7 }} />
              <Heading size="sm" mb={2}>
                No analyses yet
              </Heading>
              <Text color="gray.400" mb={4}>
                Your saved reports will show up here.
              </Text>
              <Button as={Link} href="/dashboard" colorScheme="teal">
                Go to dashboard
              </Button>
            </Box>
          )}

          {!loading && !error && data && data.items.length > 0 && (
            <VStack align="stretch" spacing={3}>
              {data.items.map((item) => (
                <Box
                  key={item.id}
                  p={4}
                  borderWidth="1px"
                  borderColor="whiteAlpha.200"
                  borderRadius="lg"
                  bg="surface.200"
                >
                  <Flex
                    justify="space-between"
                    align={{ base: 'stretch', md: 'center' }}
                    gap={3}
                    direction={{ base: 'column', md: 'row' }}
                  >
                    <VStack align="start" spacing={1} minW={0}>
                      <HStack flexWrap="wrap">
                        <Text fontWeight="700">
                          {item.owner}/{item.repo}
                        </Text>
                        <StatusBadge status={item.status} />
                      </HStack>
                      <Text fontSize="sm" color="gray.400">
                        {new Date(item.createdAt).toLocaleString()}
                        {item.projectType ? ` · ${item.projectType}` : ''}
                      </Text>
                      {item.status === 'failed' && item.error && (
                        <Text fontSize="sm" color="red.300" noOfLines={2}>
                          {item.error}
                        </Text>
                      )}
                    </VStack>
                    <HStack>
                      <Tooltip label="Open on GitHub">
                        <IconButton
                          aria-label="Open repository on GitHub"
                          icon={<ExternalLinkIcon />}
                          size="sm"
                          variant="ghost"
                          as="a"
                          href={item.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      </Tooltip>
                      <Button
                        size="sm"
                        isDisabled={item.status !== 'completed'}
                        onClick={() => router.push(`/analysis?id=${item.id}`)}
                      >
                        Open
                      </Button>
                      <IconButton
                        aria-label="Delete analysis"
                        icon={<DeleteIcon />}
                        size="sm"
                        colorScheme="red"
                        variant="ghost"
                        isLoading={deletingId === item.id}
                        isDisabled={item.status === 'pending' || item.status === 'processing'}
                        onClick={() => handleDelete(item.id)}
                      />
                    </HStack>
                  </Flex>
                </Box>
              ))}

              <Flex justify="space-between" align="center" pt={2} wrap="wrap" gap={2}>
                <Text fontSize="sm" color="gray.500">
                  Page {data.page} of {data.totalPages} · {data.total} total
                </Text>
                <HStack>
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={data.page <= 1}
                    onClick={() => loadHistory(data.page - 1, statusFilter)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={data.page >= data.totalPages}
                    onClick={() => loadHistory(data.page + 1, statusFilter)}
                  >
                    Next
                  </Button>
                </HStack>
              </Flex>
            </VStack>
          )}
        </VStack>
      </Container>
    </Box>
  );
}
