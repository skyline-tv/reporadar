'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
  Link,
  Code,
  Badge,
  Button,
  useColorModeValue,
} from '@chakra-ui/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Section = { id: string; title: string };

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function severityFromTitle(title: string): 'critical' | 'warning' | 'info' | null {
  const t = title.toLowerCase();
  if (t.includes('critical')) return 'critical';
  if (t.includes('security')) return 'warning';
  if (t.includes('quality') || t.includes('missing')) return 'info';
  return null;
}

export default function ReportViewer({ markdown }: { markdown: string }) {
  const [active, setActive] = useState<string>('');
  const border = useColorModeValue('gray.200', 'whiteAlpha.200');
  const codeBg = useColorModeValue('gray.100', 'blackAlpha.500');
  const muted = useColorModeValue('gray.600', 'gray.400');

  const sections: Section[] = useMemo(() => {
    const found: Section[] = [];
    const re = /^##\s+(.+)$/gm;
    let match;
    while ((match = re.exec(markdown))) {
      const title = match[1].trim();
      found.push({ id: slugify(title), title });
    }
    return found;
  }, [markdown]);

  useEffect(() => {
    if (sections[0]) setActive(sections[0].id);
  }, [sections]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    sections.forEach((section) => {
      const el = document.getElementById(section.id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(section.id);
        },
        { rootMargin: '-20% 0px -60% 0px', threshold: 0.1 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [sections, markdown]);

  return (
    <Flex gap={6} align="flex-start" direction={{ base: 'column', lg: 'row' }}>
      <Box
        as="aside"
        display={{ base: 'none', lg: 'block' }}
        w="220px"
        flexShrink={0}
        position="sticky"
        top="88px"
        maxH="calc(100vh - 120px)"
        overflowY="auto"
        borderWidth="1px"
        borderColor={border}
        borderRadius="lg"
        bg="surface.200"
        p={3}
      >
        <Text fontSize="xs" fontWeight="700" color={muted} mb={3} letterSpacing="0.06em">
          ON THIS REPORT
        </Text>
        <VStack align="stretch" spacing={1}>
          {sections.map((section) => {
            const sev = severityFromTitle(section.title);
            return (
              <Button
                key={section.id}
                as="a"
                href={`#${section.id}`}
                size="sm"
                variant="ghost"
                justifyContent="flex-start"
                fontWeight={active === section.id ? '700' : '500'}
                color={active === section.id ? 'brand.300' : 'gray.300'}
                bg={active === section.id ? 'whiteAlpha.100' : 'transparent'}
                rightIcon={
                  sev ? (
                    <Badge
                      colorScheme={sev === 'critical' ? 'red' : sev === 'warning' ? 'orange' : 'cyan'}
                      fontSize="0.65rem"
                    >
                      {sev}
                    </Badge>
                  ) : undefined
                }
              >
                <Text noOfLines={1} textAlign="left">
                  {section.title}
                </Text>
              </Button>
            );
          })}
        </VStack>
      </Box>

      {/* Mobile section chips */}
      <Box display={{ base: 'block', lg: 'none' }} w="full" overflowX="auto" pb={2}>
        <HStack spacing={2} minW="max-content">
          {sections.map((section) => (
            <Button
              key={section.id}
              as="a"
              href={`#${section.id}`}
              size="xs"
              variant={active === section.id ? 'solid' : 'outline'}
            >
              {section.title}
            </Button>
          ))}
        </HStack>
      </Box>

      <Box
        flex="1"
        minW={0}
        borderWidth="1px"
        borderColor={border}
        borderRadius="lg"
        bg="surface.200"
        p={{ base: 4, md: 6 }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2: ({ children }) => {
              const title = String(children);
              const id = slugify(title);
              const sev = severityFromTitle(title);
              return (
                <Heading
                  as="h2"
                  id={id}
                  size="md"
                  mt={8}
                  mb={4}
                  pb={2}
                  borderBottomWidth="1px"
                  borderColor={border}
                  scrollMarginTop="96px"
                  display="flex"
                  alignItems="center"
                  gap={2}
                >
                  {children}
                  {sev && (
                    <Badge colorScheme={sev === 'critical' ? 'red' : sev === 'warning' ? 'orange' : 'cyan'}>
                      {sev}
                    </Badge>
                  )}
                </Heading>
              );
            },
            h3: ({ children }) => (
              <Heading as="h3" size="sm" mt={5} mb={2} color="gray.200">
                {children}
              </Heading>
            ),
            p: ({ children }) => (
              <Text my={3} color="gray.300" lineHeight="1.7" fontSize="sm">
                {children}
              </Text>
            ),
            li: ({ children }) => (
              <Box as="li" my={1.5} color="gray.300" fontSize="sm" lineHeight="1.6">
                {children}
              </Box>
            ),
            ul: ({ children }) => (
              <Box as="ul" pl={5} my={3} sx={{ listStyleType: 'disc' }}>
                {children}
              </Box>
            ),
            ol: ({ children }) => (
              <Box as="ol" pl={5} my={3} sx={{ listStyleType: 'decimal' }}>
                {children}
              </Box>
            ),
            code: ({ className, children }) => {
              const inline = !className;
              const text = String(children).replace(/\n$/, '');
              if (inline) {
                const looksLikePath = /[./]/.test(text) && text.length < 120;
                return (
                  <Code
                    px={1.5}
                    py={0.5}
                    borderRadius="sm"
                    bg={looksLikePath ? 'blackAlpha.600' : codeBg}
                    color={looksLikePath ? 'brand.200' : 'gray.100'}
                    fontSize="0.85em"
                  >
                    {text}
                  </Code>
                );
              }
              return (
                <Box position="relative" my={4}>
                  <Box
                    as="pre"
                    p={4}
                    borderRadius="md"
                    bg="blackAlpha.600"
                    borderWidth="1px"
                    borderColor={border}
                    overflowX="auto"
                    fontSize="sm"
                    fontFamily="mono"
                  >
                    <code>{text}</code>
                  </Box>
                  <Button
                    size="xs"
                    position="absolute"
                    top={2}
                    right={2}
                    onClick={() => navigator.clipboard.writeText(text)}
                    aria-label="Copy code"
                  >
                    Copy
                  </Button>
                </Box>
              );
            },
            a: ({ href, children }) => (
              <Link href={href} color="brand.300" isExternal>
                {children}
              </Link>
            ),
            blockquote: ({ children }) => (
              <Box
                borderLeftWidth="3px"
                borderColor="brand.500"
                pl={4}
                my={4}
                color={muted}
                bg="whiteAlpha.50"
                py={2}
              >
                {children}
              </Box>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </Box>
    </Flex>
  );
}
