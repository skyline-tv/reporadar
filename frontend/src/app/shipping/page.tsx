'use client';

import {
  Box,
  Container,
  Heading,
  Text,
  VStack,
  Divider,
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import AppNav from '../components/AppNav';

const MotionBox = motion(Box);

const ShippingPolicy = () => {
  return (
    <Box minH="100vh" bg="surface.500">
      <AppNav />
      <Container maxW="container.lg" py={10}>
        <MotionBox
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <VStack spacing={8} align="stretch">
            <Heading size="xl" textAlign="center" color="white" letterSpacing="-0.03em" mb={4}>
              Shipping Policy
            </Heading>

            <Box bg="surface.200" borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={8}>
              <VStack spacing={6} align="stretch">
                
                <Box>
                  <Heading size="lg" color="white" mb={4}>
                    Digital Product Delivery
                  </Heading>
                  <Text color="whiteAlpha.800" lineHeight="1.8">
                    RepoRadar is a digital service that provides AI-powered GitHub repository analysis. Since we offer a software-as-a-service (SaaS) solution, there are no physical goods to be shipped. Access to our services is provided instantly upon successful payment processing.
                  </Text>
                </Box>

                <Divider borderColor="whiteAlpha.300" />

                <Box>
                  <Heading size="md" color="white" mb={3}>
                    Service Activation
                  </Heading>
                  <Text color="whiteAlpha.800" lineHeight="1.8">
                    Upon successful subscription payment, your RepoRadar account will be activated or upgraded immediately. You will receive an email confirmation with details of your purchase and instructions on how to access or use any premium features included in your plan.
                  </Text>
                </Box>

                <Divider borderColor="whiteAlpha.300" />

                <Box>
                  <Heading size="md" color="white" mb={3}>
                    Account Access
                  </Heading>
                  <Text color="whiteAlpha.800" lineHeight="1.8">
                    Your RepoRadar subscription provides access to our analysis tools, AI features, and other services as outlined in your chosen plan. Access is typically granted within minutes of payment confirmation, but may occasionally take up to 24 hours in exceptional circumstances.
                  </Text>
                  <Text color="whiteAlpha.800" lineHeight="1.8" mt={3}>
                    If you do not receive access within 24 hours of payment, please contact our support team at support@reporadar.com.
                  </Text>
                </Box>

                <Divider borderColor="whiteAlpha.300" />

                <Box>
                  <Heading size="md" color="white" mb={3}>
                    Promotional Materials
                  </Heading>
                  <Text color="whiteAlpha.800" lineHeight="1.8">
                    In the event that we offer physical promotional materials or merchandise related to our service:
                  </Text>
                  <Text color="whiteAlpha.800" lineHeight="1.8" mt={3}>
                    • Shipping costs will be calculated and displayed at checkout<br />
                    • Delivery times will vary based on location and shipping method selected<br />
                    • We ship promotional materials within India using reputable courier services<br />
                    • International shipping for promotional materials may be available at an additional cost
                  </Text>
                </Box>

                <Divider borderColor="whiteAlpha.300" />

                <Box>
                  <Heading size="md" color="white" mb={3}>
                    Order Tracking
                  </Heading>
                  <Text color="whiteAlpha.800" lineHeight="1.8">
                    For any physical promotional items, tracking information will be provided via email once your package has been shipped. You can also view order status by logging into your account on our website.
                  </Text>
                </Box>

                <Divider borderColor="whiteAlpha.300" />

                <Box>
                  <Heading size="md" color="white" mb={3}>
                    Shipping Restrictions
                  </Heading>
                  <Text color="whiteAlpha.800" lineHeight="1.8">
                    For any physical promotional items, we currently ship within India. International shipping availability varies by region. Please contact us at support@reporadar.com for specific information about international shipping options for promotional materials.
                  </Text>
                </Box>

                <Divider borderColor="whiteAlpha.300" />

                <Box>
                  <Heading size="md" color="white" mb={3}>
                    Contact Information
                  </Heading>
                  <Text color="whiteAlpha.800" lineHeight="1.8">
                    If you have any questions about accessing your digital subscription or shipping of promotional materials, please contact us:
                  </Text>
                  <Text color="whiteAlpha.800" lineHeight="1.8" mt={3}>
                    Email: support@reporadar.com<br />
                    Phone: +91 98765 43210<br />
                    Hours: Monday - Friday, 9:00 AM - 6:00 PM IST
                  </Text>
                </Box>

                <Box textAlign="center" mt={6} pt={6} borderTop="1px solid" borderColor="whiteAlpha.200">
                  <Text color="whiteAlpha.700" fontSize="sm">
                    Last updated: June 11, 2025
                  </Text>
                </Box>

              </VStack>
            </Box>
          </VStack>
        </MotionBox>
      </Container>
    </Box>
  );
};

export default ShippingPolicy;
