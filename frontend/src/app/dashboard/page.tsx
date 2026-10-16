'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Container,
  Heading,
  Text,
  SimpleGrid,
  VStack,
  HStack,
  Button,
  Input,
  Spinner,
  Alert,
  AlertIcon,
  Flex,
  useToast,
} from '@chakra-ui/react';
import { FiArrowRight, FiSearch } from 'react-icons/fi';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppNav from '../components/AppNav';
import StatusBadge from '../components/StatusBadge';
import { apiUrl } from '@/lib/api';
import { DEMO_REPO_LABEL, DEMO_REPO_URL } from '@/lib/demo';

interface HistoryItem {
  id: string;
  owner: string;
  repo: string;
  repoUrl: string;
  status: string;
  projectType?: string | null;
  createdAt: string;
  error?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [repoUrl, setRepoUrl] = useState(DEMO_REPO_URL);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [recentRes, completedRes, failedRes] = await Promise.all([
        fetch(apiUrl('/analysis/history?page=1&limit=8'), { headers }),
        fetch(apiUrl('/analysis/history?page=1&limit=1&status=completed'), { headers }),
        fetch(apiUrl('/analysis/history?page=1&limit=1&status=failed'), { headers }),
      ]);
      if (recentRes.status === 401) {
        localStorage.removeItem('token');
        router.push('/login');
        return;
      }
      const recentPayload = await recentRes.json();
      if (!recentRes.ok) throw new Error(recentPayload.message || 'Failed to load dashboard');
      setItems(recentPayload.data.items || []);
      setTotal(recentPayload.data.total || 0);

      if (completedRes.ok) {
        const c = await completedRes.json();
        setCompletedCount(c.data?.total || 0);
      }
      if (failedRes.ok) {
        const f = await failedRes.json();
        setFailedCount(f.data?.total || 0);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(
    () => ({
      total,
      completedRecent: completedCount,
      failedRecent: failedCount,
    }),
    [total, completedCount, failedCount]
  );

  const startAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    const value = repoUrl.trim();
    if (!value) {
      toast({ title: 'Enter a GitHub URL', status: 'warning', duration: 2500, isClosable: true });
      return;
    }
    const ok = /^(https?:\/\/)?(www\.)?github\.com\/[^/\s]+\/[^/\s]+/i.test(value);
    if (!ok) {
      toast({
        title: 'Invalid GitHub URL',
        description: 'Use a public repo URL like https://github.com/owner/repo',
        status: 'error',
        duration: 3500,
        isClosable: true,
      });
      return;
    }
    const normalized = value.startsWith('http') ? value : `https://${value}`;
    setSubmitting(true);
    localStorage.setItem('analyzedRepo', normalized);
    router.push('/analysis');
  };

  return (
    <Box minH="100vh" bg="surface.500">
      <AppNav />
      <Container maxW="container.xl" py={{ base: 6, md: 10 }}>
        <VStack align="stretch" spacing={8}>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            justify="space-between"
            align={{ base: 'stretch', md: 'flex-end' }}
            gap={4}
          >
            <Box>
              <Heading size="lg" letterSpacing="-0.03em" mb={2}>
                Dashboard
              </Heading>
              <Text color="gray.400" maxW="xl">
                Analyze repositories, reopen past reports, and jump back into chat.
              </Text>
            </Box>
            <Button as={Link} href="/history" variant="outline" rightIcon={<FiArrowRight />}>
              View all history
            </Button>
          </Flex>

          <Box
            as="form"
            onSubmit={startAnalyze}
            borderWidth="1px"
            borderColor="whiteAlpha.200"
            bg="surface.200"
            borderRadius="lg"
            p={{ base: 4, md: 6 }}
          >
            <Text fontWeight="700" mb={1}>
              Analyze a repository
            </Text>
            <Text fontSize="sm" color="gray.400" mb={3}>
              Demo tip: use the public repo{' '}
              <Button
                variant="link"
                colorScheme="teal"
                size="sm"
                verticalAlign="baseline"
                onClick={() => setRepoUrl(DEMO_REPO_URL)}
              >
                {DEMO_REPO_LABEL}
              </Button>{' '}
              for a reliable live walkthrough.
            </Text>
            <Flex gap={3} direction={{ base: 'column', md: 'row' }}>
              <Input
                placeholder={DEMO_REPO_URL}
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                aria-label="GitHub repository URL"
                size="lg"
                isDisabled={submitting}
              />
              <Button
                type="submit"
                size="lg"
                leftIcon={<FiSearch />}
                minW={{ md: '180px' }}
                isLoading={submitting}
                loadingText="Starting…"
              >
                Analyze
              </Button>
            </Flex>
          </Box>

          <SimpleGrid columns={{ base: 1, sm: 3 }} gap={4}>
            {[
              { label: 'Total analyses', value: stats.total },
              { label: 'Completed reports', value: stats.completedRecent },
              { label: 'Failed analyses', value: stats.failedRecent },
            ].map((stat) => (
              <Box
                key={stat.label}
                borderWidth="1px"
                borderColor="whiteAlpha.200"
                bg="surface.200"
                borderRadius="lg"
                p={5}
              >
                <Text fontSize="sm" color="gray.400" mb={1}>
                  {stat.label}
                </Text>
                <Text fontSize="3xl" fontWeight="700" letterSpacing="-0.03em">
                  {loading ? '—' : stat.value}
                </Text>
              </Box>
            ))}
          </SimpleGrid>

          <Box>
            <Flex justify="space-between" align="center" mb={4}>
              <Heading size="md">Recent activity</Heading>
              <Button as={Link} href="/history" size="sm" variant="ghost">
                See all
              </Button>
            </Flex>

            {loading && (
              <Flex justify="center" py={12}>
                <Spinner color="brand.400" />
              </Flex>
            )}

            {!loading && error && (
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                {error}
              </Alert>
            )}

            {!loading && !error && items.length === 0 && (
              <Box
                borderWidth="1px"
                borderColor="whiteAlpha.200"
                borderRadius="lg"
                bg="surface.200"
                p={10}
                textAlign="center"
              >
                <Heading size="sm" mb={2}>
                  No analyses yet
                </Heading>
                <Text color="gray.400" mb={4}>
                  Paste a GitHub URL above to generate your first report.
                </Text>
              </Box>
            )}

            {!loading && !error && items.length > 0 && (
              <VStack align="stretch" spacing={3}>
                {items.map((item) => (
                  <Flex
                    key={item.id}
                    borderWidth="1px"
                    borderColor="whiteAlpha.200"
                    bg="surface.200"
                    borderRadius="lg"
                    p={4}
                    gap={3}
                    direction={{ base: 'column', sm: 'row' }}
                    justify="space-between"
                    align={{ base: 'stretch', sm: 'center' }}
                  >
                    <Box minW={0}>
                      <HStack mb={1} flexWrap="wrap">
                        <Text fontWeight="700" noOfLines={1}>
                          {item.owner}/{item.repo}
                        </Text>
                        <StatusBadge status={item.status} />
                      </HStack>
                      <Text fontSize="sm" color="gray.400">
                        {new Date(item.createdAt).toLocaleString()}
                        {item.projectType ? ` · ${item.projectType}` : ''}
                      </Text>
                      {item.status === 'failed' && item.error && (
                        <Text fontSize="sm" color="red.300" noOfLines={1} mt={1}>
                          {item.error}
                        </Text>
                      )}
                    </Box>
                    <HStack>
                      <Button
                        size="sm"
                        variant="outline"
                        isDisabled={item.status !== 'completed'}
                        onClick={() => router.push(`/analysis?id=${item.id}`)}
                      >
                        Open report
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          localStorage.setItem('analyzedRepo', item.repoUrl);
                          router.push('/chat');
                        }}
                      >
                        Chat
                      </Button>
                    </HStack>
                  </Flex>
                ))}
              </VStack>
            )}
          </Box>
        </VStack>
      </Container>
    </Box>
  );
}
